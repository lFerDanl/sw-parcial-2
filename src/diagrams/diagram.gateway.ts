import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { DiagramsService } from './diagrams.service';
import { Diagram } from './entities/diagram.entity';

type RoomId = string;

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  path: '/socket.io',
})
export class DiagramGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly jwtService: JwtService,
    private readonly diagramsService: DiagramsService,
  ) { }

  @WebSocketServer() server: Server;

  afterInit(server: Server) {
    console.log('DiagramGateway initialized');
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    try {
      const payload = await this.jwtService.verifyAsync(token);
      (client as any).user = payload;
      console.log('Usuario conectado:', payload);
    } catch (e) {
      console.log('Token inválido');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // ---------------------------
  // Unirse a un diagrama (sala)
  // ---------------------------
  @SubscribeMessage('joinDiagram')
  async handleJoinDiagram(client: Socket, payload: { diagramId: number }) {
    const { diagramId } = payload;
    const user = (client as any).user;

    // Traer diagrama de DB
    const diagram: Diagram = await this.diagramsService.findOne(diagramId, { id: user.sub } as any);

    client.join(`diagram:${diagramId}`);
    console.log(`Client ${client.id} joined diagram room ${diagramId}`);

    // Enviar estado completo actual del diagrama al cliente
    client.emit('diagram:init', { diagram: diagram.content });

    // Notificar a otros usuarios que un nuevo usuario se unió
    client.to(`diagram:${diagramId}`).emit('userJoined', { clientId: client.id, user });
  }

  // ---------------------------
  // Actualización de todo el grafo (guardar cambios)
  // ---------------------------
  @SubscribeMessage('diagram:update')
  async handleDiagramUpdate(client: Socket, payload: { diagramId: number; content: any; save?: boolean }) {
    const { diagramId, content, save } = payload;
    const room = `diagram:${diagramId}`;

    // Emitir cambio a todos excepto el que lo envió
    client.to(room).emit('diagram:update', { clientId: client.id, content });

    // Persistir en DB si save = true
    if (save) {
      const user = (client as any).user;
      await this.diagramsService.update(diagramId, { content }, { id: user.sub } as any);
    }
  }

  // ---------------------------
  // Generar diagrama desde prompt
  // ---------------------------
  @SubscribeMessage('diagram:generateFromPrompt')
  async handleGenerateFromPrompt(
    client: Socket,
    payload: { diagramId: number; prompt: string }
  ) {
    const { diagramId, prompt } = payload;
    const user = (client as any).user;

    try {
      // Generar el diagrama
      const updatedDiagram = await this.diagramsService.generateDiagramFromPrompt(
        diagramId,
        prompt,
        { id: user.sub } as any
      );

      // Emitir el nuevo contenido a todos los clientes conectados
      this.server.to(`diagram:${diagramId}`).emit('diagram:generated', {
        content: updatedDiagram.content,
        generatedBy: client.id,
      });

      // También enviar al cliente que lo solicitó
      client.emit('diagram:generated', {
        content: updatedDiagram.content,
        generatedBy: client.id,
      });

    } catch (error) {
      client.emit('diagram:generateError', {
        error: error.message || 'Error al generar el diagrama'
      });
    }
  }

  // ---------------------------
  // Movimiento de elementos en tiempo real
  // ---------------------------


  @SubscribeMessage('element:moving')
  handleElementMoving(client: Socket, payload: { diagramId: number; elementId: string; position: { x: number; y: number } }) {
    const { diagramId, elementId, position } = payload;
    // Emitir a todos menos el que lo envía
    client.to(`diagram:${diagramId}`).emit('element:moving', { elementId, position });
  }

  @SubscribeMessage('element:moved')
  async handleElementMoved(client: Socket, payload: { diagramId: number; elementId: string; position: { x: number; y: number } }) {
    const { diagramId, elementId, position } = payload;
    // Emitir posición final a todos menos el que lo envía
    client.to(`diagram:${diagramId}`).emit('element:moved', { elementId, position, isFinal: true });

    // Persistir posición final en DB
    const user = (client as any).user;
    const diagram = await this.diagramsService.findOne(diagramId, { id: user.sub } as any);
    if (!diagram.content.elements) diagram.content.elements = {};
    if (!diagram.content.elements[elementId]) diagram.content.elements[elementId] = {};
    diagram.content.elements[elementId].position = position;
    await this.diagramsService.update(diagramId, { content: diagram.content }, { id: user.sub } as any);
  }


  // ---------------------------
  // Cursor en tiempo real
  // ---------------------------
  @SubscribeMessage('cursor:update')
  handleCursorUpdate(client: Socket, payload: { diagramId: number; position: { x: number; y: number } }) {
    const { diagramId, position } = payload;
    client.to(`diagram:${diagramId}`).emit('cursor:update', { clientId: client.id, position, user: (client as any).user });
  }

  // ---------------------------
  // Atributos
  // ---------------------------

  @SubscribeMessage('attribute:add')
  async handleAddAttribute(client: Socket, payload: { diagramId: number; classId: string; attribute: { name: string; type: string } }) {
    const user = (client as any).user;
    await this.diagramsService.addAttribute(payload.diagramId, payload.classId, payload.attribute, { id: user.sub } as any);

    // Emitir cambio a otros clientes en la sala
    client.to(`diagram:${payload.diagramId}`).emit('attribute:add', {
      clientId: client.id,
      classId: payload.classId,
      attribute: payload.attribute,
    });
  }

  @SubscribeMessage('attribute:update')
  async handleUpdateAttribute(client: Socket, payload: { diagramId: number; classId: string; attrIndex: number; newData: { name?: string; type?: string } }) {
    const user = (client as any).user;
    await this.diagramsService.updateAttribute(payload.diagramId, payload.classId, payload.attrIndex, payload.newData, { id: user.sub } as any);

    client.to(`diagram:${payload.diagramId}`).emit('attribute:update', {
      clientId: client.id,
      classId: payload.classId,
      attrIndex: payload.attrIndex,
      newData: payload.newData,
    });
  }

  @SubscribeMessage('attribute:remove')
  async handleRemoveAttribute(client: Socket, payload: { diagramId: number; classId: string; attrIndex: number }) {
    const user = (client as any).user;
    await this.diagramsService.removeAttribute(payload.diagramId, payload.classId, payload.attrIndex, { id: user.sub } as any);

    client.to(`diagram:${payload.diagramId}`).emit('attribute:remove', {
      clientId: client.id,
      classId: payload.classId,
      attrIndex: payload.attrIndex,
    });
  }

  // ---------------------------
  // Classes
  // ---------------------------

  @SubscribeMessage('class:add')
  async handleAddClass(client: Socket, payload: { diagramId: number; classId: string; classData: { name: string; position: { x: number; y: number }; attributes?: any[] } }) {
    const user = (client as any).user;
    await this.diagramsService.addClass(payload.diagramId, payload.classId, payload.classData, { id: user.sub } as any);

    client.to(`diagram:${payload.diagramId}`).emit('class:add', {
      clientId: client.id,
      classId: payload.classId,
      classData: payload.classData,
    });
  }

  @SubscribeMessage('class:update')
  async handleUpdateClass(client: Socket, payload: { diagramId: number; classId: string; newData: { name?: string } }) {
    const { diagramId, classId, newData } = payload;
    const user = (client as any).user;

    // Actualizar en la DB
    const diagram = await this.diagramsService.findOne(diagramId, { id: user.sub } as any);
    if (!diagram.content.elements[classId]) diagram.content.elements[classId] = {};
    diagram.content.elements[classId].name = newData.name || diagram.content.elements[classId].name;
    await this.diagramsService.update(diagramId, { content: diagram.content }, { id: user.sub } as any);

    // Emitir cambio a los demás usuarios
    client.to(`diagram:${diagramId}`).emit('class:update', {
      clientId: client.id,
      classId,
      newData,
    });
  }

  @SubscribeMessage('class:remove')
  async handleRemoveClass(client: Socket, payload: { diagramId: number; classId: string }) {
    const user = (client as any).user;
    await this.diagramsService.removeClass(payload.diagramId, payload.classId, { id: user.sub } as any);

    client.to(`diagram:${payload.diagramId}`).emit('class:remove', {
      clientId: client.id,
      classId: payload.classId,
    });
  }

  // ---------------------------
  // Relaciones
  // ---------------------------

  @SubscribeMessage('relation:add')
  async handleAddRelation(
    client: Socket,
    payload: {
      diagramId: number;
      relationId: string;
      data: {
        from: string;
        to: string;
        type: string;
        vertices?: { x: number; y: number }[];
        labels?: any[];
        attrs?: any;
        router?: any;
        connector?: any;
      };
    }
  ) {
    const user = (client as any).user;
    await this.diagramsService.addRelation(payload.diagramId, payload.relationId, payload.data, { id: user.sub } as any);
  
    client.to(`diagram:${payload.diagramId}`).emit('relation:add', {
      clientId: client.id,
      relationId: payload.relationId,
      data: payload.data, // ahora incluye vertices, labels, attrs, router, connector si existen
    });
  }
  

  @SubscribeMessage('relation:update')
  async handleUpdateRelation(
    client: Socket,
    payload: {
      diagramId: number;
      relationId: string;
      data: Partial<{
        from: string;
        to: string;
        type: string;
        vertices: { x: number; y: number }[];
        labels: any[];
        attrs: any;
        router: any;
        connector: any;
      }>;
    }
  ) {
    const user = (client as any).user;
    
    try {
      await this.diagramsService.updateRelation(
        payload.diagramId, 
        payload.relationId, 
        payload.data, 
        { id: user.sub } as any
      );
  
      // Solo emitir si se actualizó exitosamente
      client.to(`diagram:${payload.diagramId}`).emit('relation:update', {
        clientId: client.id,
        relationId: payload.relationId,
        data: payload.data,
      });
    } catch (error) {
      // ✅ Log pero no crashear
      console.warn(`Could not update relation ${payload.relationId}:`, error.message);
      // No emitir error al cliente
    }
  }

@SubscribeMessage('relation:remove')
async handleRemoveRelation(
  client: Socket, 
  payload: { diagramId: number; relationId: string }
) {
  const user = (client as any).user;
  
  try {
    await this.diagramsService.removeRelation(
      payload.diagramId, 
      payload.relationId, 
      { id: user.sub } as any
    );

    // Solo emitir si se eliminó exitosamente
    client.to(`diagram:${payload.diagramId}`).emit('relation:remove', {
      clientId: client.id,
      relationId: payload.relationId,
    });
  } catch (error) {
    // ✅ Log pero no crashear
    console.warn(`Could not remove relation ${payload.relationId}:`, error.message);
    // No emitir error al cliente
  }
}


}
