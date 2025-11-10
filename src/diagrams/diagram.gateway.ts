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
  pingTimeout: 60000, 
  pingInterval: 25000,
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

    const diagram: Diagram = await this.diagramsService.findOne(diagramId, { id: user.sub } as any);

    client.join(`diagram:${diagramId}`);
    console.log(`Client ${client.id} joined diagram room ${diagramId}`);

    client.emit('diagram:init', { diagram: diagram.content });
    client.to(`diagram:${diagramId}`).emit('userJoined', { clientId: client.id, user });
  }

  // ---------------------------
  // Actualización de todo el grafo (guardar cambios)
  // ---------------------------
  @SubscribeMessage('diagram:update')
  async handleDiagramUpdate(client: Socket, payload: { diagramId: number; content: any; save?: boolean }) {
    const { diagramId, content, save } = payload;
    const room = `diagram:${diagramId}`;

    client.to(room).emit('diagram:update', { clientId: client.id, content });

    if (save) {
      const user = (client as any).user;
      await this.diagramsService.update(diagramId, { content }, { id: user.sub } as any);
    }
  }

  // ---------------------------
  // ✅ SOLUCIÓN: Generar diagrama desde prompt (patrón async)
  // ---------------------------
  @SubscribeMessage('diagram:generateFromPrompt')
  async handleGenerateFromPrompt(
    client: Socket,
    payload: { 
      diagramId: number; 
      prompt: string;
      mode?: 'replace' | 'merge';
    }
  ) {
    const { diagramId, prompt, mode = 'merge' } = payload;
    const user = (client as any).user;
    
    // ✅ 1. Responder inmediatamente con ACK
    client.emit('diagram:generating', {
      message: 'Generando diagrama...',
      status: 'processing'
    });
  
    // ✅ 2. Procesar de forma asíncrona SIN await en el handler
    this.processGenerateFromPrompt(client, diagramId, prompt, mode, user)
      .catch(error => {
        console.error('Error generating diagram:', error);
        client.emit('diagram:generateError', {
          error: error.message || 'Error al generar el diagrama'
        });
      });
    
    // ✅ 3. El handler termina inmediatamente
  }

  // ✅ Método auxiliar que procesa en background
  private async processGenerateFromPrompt(
    client: Socket,
    diagramId: number,
    prompt: string,
    mode: 'replace' | 'merge',
    user: any
  ) {
    try {
      // Emitir progreso cada 10 segundos mientras se genera
      const progressInterval = setInterval(() => {
        client.emit('diagram:generating', {
          message: 'Aún generando, esto puede tomar hasta 30 segundos...',
          status: 'processing'
        });
      }, 10000);

      const updatedDiagram = await this.diagramsService.generateDiagramFromPrompt(
        diagramId,
        prompt,
        { id: user.sub } as any,
        mode
      );

      clearInterval(progressInterval);

      // Broadcast a TODOS los clientes en la sala
      this.server.to(`diagram:${diagramId}`).emit('diagram:generated', {
        content: updatedDiagram.content,
        generatedBy: client.id,
        mode,
      });

      client.emit('diagram:generated', {
        content: updatedDiagram.content,
        generatedBy: client.id,
        mode,
      });

    } catch (error) {
      throw error; // Se captura en el catch del handler principal
    }
  }

  // ---------------------------
  // ✅ SOLUCIÓN: Generar diagrama desde imagen (patrón async)
  // ---------------------------
  @SubscribeMessage('diagram:generateFromImage')
  async handleGenerateFromImage(
    client: Socket,
    payload: { 
      diagramId: number; 
      imageData: string;
      mimeType: string;
      additionalPrompt?: string;
      mode?: 'replace' | 'merge'; 
    }
  ) {
    const { diagramId, imageData, mimeType, additionalPrompt = '', mode = 'merge' } = payload;
    const user = (client as any).user;

    // ✅ 1. Responder inmediatamente con ACK
    client.emit('diagram:generating', {
      message: 'Analizando imagen y generando diagrama...',
      status: 'processing'
    });

    // ✅ 2. Procesar de forma asíncrona
    this.processGenerateFromImage(client, diagramId, imageData, mimeType, additionalPrompt, mode, user)
      .catch(error => {
        console.error('Error generating diagram from image:', error);
        client.emit('diagram:generateError', {
          error: error.message || 'Error al generar el diagrama desde imagen'
        });
      });
  }

  // ✅ Método auxiliar para procesamiento en background
  private async processGenerateFromImage(
    client: Socket,
    diagramId: number,
    imageData: string,
    mimeType: string,
    additionalPrompt: string,
    mode: 'replace' | 'merge',
    user: any
  ) {
    try {
      const progressInterval = setInterval(() => {
        client.emit('diagram:generating', {
          message: 'Procesando imagen, esto puede tomar hasta 30 segundos...',
          status: 'processing'
        });
      }, 10000);

      const imageBuffer = Buffer.from(imageData, 'base64');

      const updatedDiagram = await this.diagramsService.generateDiagramFromImage(
        diagramId,
        imageBuffer,
        mimeType,
        additionalPrompt,
        { id: user.sub } as any,
        mode 
      );

      clearInterval(progressInterval);

      this.server.to(`diagram:${diagramId}`).emit('diagram:generated', {
        content: updatedDiagram.content,
        generatedBy: client.id,
        mode, 
      });

      client.emit('diagram:generated', {
        content: updatedDiagram.content,
        generatedBy: client.id,
        mode,
      });

    } catch (error) {
      throw error;
    }
  }

  // ---------------------------
  // Movimiento de elementos en tiempo real
  // ---------------------------

  @SubscribeMessage('element:moving')
  handleElementMoving(client: Socket, payload: { diagramId: number; elementId: string; position: { x: number; y: number } }) {
    const { diagramId, elementId, position } = payload;
    client.to(`diagram:${diagramId}`).emit('element:moving', { elementId, position });
  }

  @SubscribeMessage('element:moved')
  async handleElementMoved(client: Socket, payload: { diagramId: number; elementId: string; position: { x: number; y: number } }) {
    const { diagramId, elementId, position } = payload;
    client.to(`diagram:${diagramId}`).emit('element:moved', { elementId, position, isFinal: true });

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

    const diagram = await this.diagramsService.findOne(diagramId, { id: user.sub } as any);
    if (!diagram.content.elements[classId]) diagram.content.elements[classId] = {};
    diagram.content.elements[classId].name = newData.name || diagram.content.elements[classId].name;
    await this.diagramsService.update(diagramId, { content: diagram.content }, { id: user.sub } as any);

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
      data: payload.data,
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
  
      client.to(`diagram:${payload.diagramId}`).emit('relation:update', {
        clientId: client.id,
        relationId: payload.relationId,
        data: payload.data,
      });
    } catch (error) {
      console.warn(`Could not update relation ${payload.relationId}:`, error.message);
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

      client.to(`diagram:${payload.diagramId}`).emit('relation:remove', {
        clientId: client.id,
        relationId: payload.relationId,
      });
    } catch (error) {
      console.warn(`Could not remove relation ${payload.relationId}:`, error.message);
    }
  }
}