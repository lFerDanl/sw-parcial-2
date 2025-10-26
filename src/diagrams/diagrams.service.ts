// src/diagrams/diagrams.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Diagram } from './entities/diagram.entity';
import { CreateDiagramDto } from './dto/create-diagram.dto';
import { User } from 'src/users/entities/user.entity';
import { UpdateDiagramDto } from './dto/update-diagram.dto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CodeGenerationService } from './code-generation.service';

@Injectable()
export class DiagramsService {
  constructor(
    @InjectRepository(Diagram)
    private readonly diagramsRepository: Repository<Diagram>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly codeGenerationService: CodeGenerationService,
  ) { }

  async create(createDiagramDto: CreateDiagramDto, user: User) {
    const diagram = this.diagramsRepository.create({
      ...createDiagramDto,
      owner: user,
    });
    return this.diagramsRepository.save(diagram);
  }

  async findAllByUser(userId: number) {
    return this.diagramsRepository.find({
      where: [{ owner: { id: userId } }],
      relations: ['owner'],
    });
  }

  async findShared(userId: number) {
    return this.diagramsRepository
      .createQueryBuilder("diagram")
      .leftJoinAndSelect("diagram.owner", "owner")
      .leftJoinAndSelect("diagram.sharedWith", "sharedWith")
      .where("sharedWith.id = :userId", { userId })
      .getMany();
  }

  async findOne(id: number, user: User) {
    const diagram = await this.diagramsRepository.findOne({
      where: { id },
      relations: ['owner', 'sharedWith'],
    });
    if (!diagram) throw new NotFoundException('Diagram not found');
    const hasAccess =
      diagram.owner.id === user.id ||
      diagram.sharedWith.some((u) => u.id === user.id);
    if (!hasAccess) throw new ForbiddenException('Access denied');
    return diagram;
  }

  async update(id: number, updateDiagramDto: UpdateDiagramDto, user: User) {
    const diagram = await this.findOne(id, user);
    Object.assign(diagram, updateDiagramDto);
    return this.diagramsRepository.save(diagram);
  }

  async remove(id: number, user: User) {
    const diagram = await this.findOne(id, user);
    return this.diagramsRepository.softRemove(diagram);
  }

  

  async shareDiagram(diagramId: number, userId: number, owner: User) {
    const diagram = await this.findOne(diagramId, owner);
    if (diagram.owner.id !== owner.id) {
      throw new ForbiddenException('Only the owner can share the diagram');
    }

    const userToShare = await this.usersRepository.findOneBy({ id: userId });
    if (!userToShare) throw new NotFoundException('User to share not found');

    diagram.sharedWith.push(userToShare);
    return this.diagramsRepository.save(diagram);
  }

  // --------------------------------------
  // Actualización parcial de elementos
  // --------------------------------------
  async updateElement(diagramId: number, elementId: string, elementData: any, user: User) {
    const diagram = await this.findOne(diagramId, user);
    if (!diagram.content.elements) diagram.content.elements = {};
    diagram.content.elements[elementId] = {
      ...diagram.content.elements[elementId],
      ...elementData,
    };
    return this.diagramsRepository.save(diagram);
  }

  // --------------------------------------
  // Mover elemento (solo posición)
  // --------------------------------------
  async moveElement(diagramId: number, elementId: string, position: { x: number; y: number }, user: User) {
    return this.updateElement(diagramId, elementId, { position }, user);
  }

  // --------------------------------------
  // Agregar un atributo a una clase
  // --------------------------------------
  async addAttribute(
    diagramId: number,
    classId: string,
    attribute: { name: string; type: string },
    user: User,
  ) {
    const diagram = await this.findOne(diagramId, user);
    if (!diagram.content.elements?.[classId]) {
      throw new NotFoundException('Class not found in diagram');
    }
    if (!diagram.content.elements[classId].attributes) {
      diagram.content.elements[classId].attributes = [];
    }
    diagram.content.elements[classId].attributes.push(attribute);
    return this.diagramsRepository.save(diagram);
  }

  // --------------------------------------
  // Editar un atributo de una clase
  // --------------------------------------
  async updateAttribute(
    diagramId: number,
    classId: string,
    attrIndex: number,
    newData: { name?: string; type?: string },
    user: User,
  ) {
    const diagram = await this.findOne(diagramId, user);
    const classElem = diagram.content.elements?.[classId];
    if (!classElem || !classElem.attributes?.[attrIndex]) {
      throw new NotFoundException('Attribute not found');
    }
    classElem.attributes[attrIndex] = { ...classElem.attributes[attrIndex], ...newData };
    return this.diagramsRepository.save(diagram);
  }

  // --------------------------------------
  // Eliminar un atributo de una clase
  // --------------------------------------
  async removeAttribute(
    diagramId: number,
    classId: string,
    attrIndex: number,
    user: User,
  ) {
    const diagram = await this.findOne(diagramId, user);
    const classElem = diagram.content.elements?.[classId];
    if (!classElem || !classElem.attributes?.[attrIndex]) {
      throw new NotFoundException('Attribute not found');
    }
    classElem.attributes.splice(attrIndex, 1);
    return this.diagramsRepository.save(diagram);
  }
  // --------------------------------------
  // Agregar una clase
  // --------------------------------------
  async addClass(
    diagramId: number,
    classId: string,
    classData: { name: string; position: { x: number; y: number }; attributes?: any[] },
    user: User,
  ) {
    const diagram = await this.findOne(diagramId, user);
    if (!diagram.content.elements) diagram.content.elements = {};
    if (diagram.content.elements[classId]) {
      throw new Error('Class already exists');
    }
    diagram.content.elements[classId] = { ...classData, attributes: classData.attributes || [] };
    return this.diagramsRepository.save(diagram);
  }

  // --------------------------------------
  // Eliminar una clase
  // --------------------------------------
  async removeClass(
    diagramId: number,
    classId: string,
    user: User,
  ) {
    const diagram = await this.findOne(diagramId, user);
    if (!diagram.content.elements?.[classId]) {
      throw new Error('Class not found');
    }

    // Eliminar relaciones asociadas a esta clase
    if (diagram.content.relations) {
      for (const relId of Object.keys(diagram.content.relations)) {
        const rel = diagram.content.relations[relId];
        if (rel.from === classId || rel.to === classId) {
          delete diagram.content.relations[relId];
        }
      }
    }

    delete diagram.content.elements[classId];
    return this.diagramsRepository.save(diagram);
  }

  // --------------------------------------
  // Crear relación
  // --------------------------------------
  async addRelation(
    diagramId: number,
    relationId: string,
    relationData: { from: string; to: string; type: string },
    user: User,
  ) {
    const diagram = await this.findOne(diagramId, user);
    if (!diagram.content.relations) diagram.content.relations = {};
    if (diagram.content.relations[relationId]) {
      throw new Error('Relation already exists');
    }
    diagram.content.relations[relationId] = relationData;
    return this.diagramsRepository.save(diagram);
  }

  // --------------------------------------
  // Actualizar relación
  // --------------------------------------
  async updateRelation(
    diagramId: number,
    relationId: string,
    relationData: Partial<{ from: string; to: string; type: string }>,
    user: User,
  ) {
    const diagram = await this.findOne(diagramId, user);
    
    // ✅ Verificar si existe antes de intentar actualizar
    if (!diagram.content.relations?.[relationId]) {
      console.warn(`Relation ${relationId} not found for update, may have been removed`);
      return diagram; // Retornar sin error
    }
    
    diagram.content.relations[relationId] = {
      ...diagram.content.relations[relationId],
      ...relationData,
    };
    return this.diagramsRepository.save(diagram);
  }

  // --------------------------------------
  // Eliminar relación
  // --------------------------------------
  async removeRelation(diagramId: number, relationId: string, user: User) {
    const diagram = await this.findOne(diagramId, user);
    
    // ✅ Verificar si existe antes de intentar eliminar
    if (!diagram.content.relations?.[relationId]) {
      console.warn(`Relation ${relationId} already removed or doesn't exist`);
      return diagram; // Retornar sin error
    }
    
    delete diagram.content.relations[relationId];
    return this.diagramsRepository.save(diagram);
  }
  
  async generateDiagramFromPrompt(
    diagramId: number,
    prompt: string,
    user: User,
  ): Promise<Diagram> {
    console.log('Generating diagram from prompt:', prompt);
    const diagram = await this.findOne(diagramId, user);
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY??'');
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  
    const systemPrompt = this.buildDiagramPrompt(prompt);
    
    const result = await model.generateContent(systemPrompt);
    const text = result.response.text();
  
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                      text.match(/{[\s\S]*}/);
    
    if (!jsonMatch) {
      throw new Error('No se pudo extraer JSON de la respuesta');
    }
  
    const generatedContent = JSON.parse(
      jsonMatch[0].startsWith('{') ? jsonMatch[0] : jsonMatch[1]
    );

    console.log('Generated Diagram Content:', JSON.stringify(generatedContent, null, 2));
  
    diagram.content = generatedContent;
    return this.diagramsRepository.save(diagram);
  }
  
  private buildDiagramPrompt(userPrompt: string): string {
    return `
  Genera un diagrama de clases UML en formato JSON basado en: "${userPrompt}"
  
  El JSON debe tener esta estructura exacta:
  {
    "elements": {
      "classX": {
        "name": "NombreClase",
        "position": { "x": número, "y": número },
        "attributes": [
          { "name": "id", "type": "Long" },          // Siempre incluir ID
          { "name": "nombreAtributo", "type": "TipoDato" }
        ]
      }
    },
    "relations": {
      "relX": {
        "from": "classId",
        "to": "classId",
        "type": "OneToMany" | "ManyToOne" | "ManyToMany" | "OneToOne" | "Inheritance" | "Aggregation" | "Composition",
        "vertices": [{ "x": número, "y": número }],
        "labels": [{ "position": 0.5, "text": "de nuevo el type" }],
        "attrs": { "line": { "stroke": "#444", "strokeWidth": 2 } },
        "router": { "name": "manhattan" },
        "connector": { "name": "rounded" }
      }
    }
  }
  
  Reglas:
  - Cada clase debe tener obligatoriamente un atributo "id" de tipo Long como clave primaria.
  - Usa IDs únicos aleatorios (ej: "class1", "class2", "rel1")
  - Posiciona las clases de forma organizada (separación de ~300px)
  - Incluye atributos relevantes con tipos de datos apropiados
  - Los tipos de datos de los atributos deben ser solo uno de los siguientes: String, Integer, Long, Double, Float, Boolean, Date, LocalDate, LocalDateTime, BigDecimal
  - Define relaciones lógicas entre clases
  - Los vértices deben estar entre las clases conectadas
  
  Responde SOLO con el JSON, sin texto adicional.
  `;
  }
  

  async generateSpringBootCode(
    diagramId: number,
    user: User,
    projectName?: string,
    basePackage?: string
  ): Promise<Buffer> {
    const diagram = await this.findOne(diagramId, user);
    
    if (!diagram.content || !diagram.content.elements) {
      throw new Error('El diagrama no tiene contenido válido');
    }

    const projectNameFinal = projectName || diagram.name.toLowerCase().replace(/\s+/g, '-');
    const basePackageFinal = basePackage || 'com.example.demo';

    return this.codeGenerationService.generateSpringBootProject(
      diagram.content as DiagramContent,
      projectNameFinal,
      basePackageFinal
    );
  }
}
