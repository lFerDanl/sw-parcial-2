// src/diagrams/code-generation-flutter.service.ts
import { Injectable } from '@nestjs/common';
import * as JSZip from 'jszip';

interface Attribute {
  name: string;
  type: string;
}

interface ClassElement {
  name: string;
  position: { x: number; y: number };
  attributes: Attribute[];
}

interface Relation {
  from: string;
  to: string;
  type: 'OneToMany' | 'ManyToOne' | 'ManyToMany' | 'OneToOne' | 'Inheritance' | 'Aggregation' | 'Composition';
  vertices?: { x: number; y: number }[];
  labels?: { position: number; text: string }[];
  attrs?: Record<string, any>;
  router?: Record<string, any>;
  connector?: Record<string, any>;
}

interface DiagramContent {
  elements: Record<string, ClassElement>;
  relations: Record<string, Relation>;
}

interface RelationshipInfo {
  type: 'OneToMany' | 'ManyToOne' | 'ManyToMany' | 'OneToOne' | 'Inheritance' | 'Aggregation' | 'Composition';
  targetClass: string;
  targetClassId: string;
  isOwner: boolean;
}

@Injectable()
export class CodeGenerationFlutterService {
  
  async generateFlutterProject(
    diagramContent: DiagramContent,
    projectName: string,
    basePackage: string
  ): Promise<Buffer> {
    const zip = new JSZip();
    
    // Análisis de relaciones
    const relationshipMap: Map<string, RelationshipInfo[]> = this.analyzeRelationships(diagramContent);
    const manyToManyAssignments: any[] = this.detectManyToManyAssignments(diagramContent);
    
    // Estructura del proyecto Flutter
    const libFolder = zip.folder('lib')!;
    const modelsFolder = libFolder.folder('models')!;
    const servicesFolder = libFolder.folder('services')!;
    const screensFolder = libFolder.folder('screens')!;
    const formsFolder = screensFolder.folder('forms')!;
    const widgetsFolder = libFolder.folder('widgets')!;
    
    // Archivos base
    zip.file('.env', this.generateEnvFile());
    zip.file('pubspec.yaml', this.generatePubspecYaml(projectName));
    libFolder.file('main.dart', this.generateMainDart(diagramContent));
    libFolder.file('config.dart', this.generateConfigDart());
    
    // Generar modelos
    for (const [classId, classElement] of Object.entries(diagramContent.elements)) {
      const modelCode = this.generateModel(classElement, relationshipMap.get(classId) || []);
      modelsFolder.file(`${this.toSnakeCase(classElement.name)}.dart`, modelCode);
    }
    
    // Generar servicios
    for (const [classId, classElement] of Object.entries(diagramContent.elements)) {
      const serviceCode = this.generateService(classElement, basePackage);
      servicesFolder.file(`${this.toSnakeCase(classElement.name)}_service.dart`, serviceCode);
    }
    
    // Generar formularios
    for (const [classId, classElement] of Object.entries(diagramContent.elements)) {
      const relationships = relationshipMap.get(classId) || [];
      const formCode = this.generateFormScreen(
        classElement, 
        relationships, 
        diagramContent,
        classId
      );
      formsFolder.file(`${this.toSnakeCase(classElement.name)}_form.dart`, formCode);
    }
    
    // Generar formularios de asignación M:M
    for (const assignment of manyToManyAssignments) {
      const assignmentFormCode = this.generateManyToManyAssignmentForm(
        assignment,
        diagramContent
      );
      formsFolder.file(`${assignment.fileName}_form.dart`, assignmentFormCode);
    }
    
    // Generar widgets auxiliares
    widgetsFolder.file('custom_dropdown.dart', this.generateCustomDropdown());
    widgetsFolder.file('nested_list_widget.dart', this.generateNestedListWidget());
    widgetsFolder.file('loading_widget.dart', this.generateLoadingWidget());
    widgetsFolder.file('error_widget.dart', this.generateErrorWidget());
    widgetsFolder.file('empty_state_widget.dart', this.generateEmptyStateWidget());
    
    // Generar lista de pantallas principales
    screensFolder.file('home_screen.dart', this.generateHomeScreen(diagramContent));
    
    const buffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });
    
    return buffer;
  }

  private analyzeRelationships(diagramContent: DiagramContent): Map<string, RelationshipInfo[]> {
    const map = new Map<string, RelationshipInfo[]>();
    
    for (const [relId, relation] of Object.entries(diagramContent.relations)) {
      const fromClass = diagramContent.elements[relation.from]?.name;
      const toClass = diagramContent.elements[relation.to]?.name;
      
      if (!fromClass || !toClass) continue;
      
      // Determinar quién posee la FK basado en el tipo de relación
      if (relation.type === 'ManyToOne') {
        // La clase "Many" (from) tiene la FK
        if (!map.has(relation.from)) map.set(relation.from, []);
        map.get(relation.from)!.push({
          type: relation.type,
          targetClass: toClass,
          targetClassId: relation.to,
          isOwner: true
        });
      } else if (relation.type === 'OneToMany') {
        // La clase "Many" (to) tiene la FK
        if (!map.has(relation.to)) map.set(relation.to, []);
        map.get(relation.to)!.push({
          type: 'ManyToOne',
          targetClass: fromClass,
          targetClassId: relation.from,
          isOwner: true
        });
      } else if (relation.type === 'OneToOne') {
        // Asumimos que "from" tiene la FK
        if (!map.has(relation.from)) map.set(relation.from, []);
        map.get(relation.from)!.push({
          type: relation.type,
          targetClass: toClass,
          targetClassId: relation.to,
          isOwner: true
        });
      } else if (relation.type === 'Inheritance') {
        // El hijo hereda del padre
        if (!map.has(relation.from)) map.set(relation.from, []);
        map.get(relation.from)!.push({
          type: relation.type,
          targetClass: toClass,
          targetClassId: relation.to,
          isOwner: false
        });
      } else if (relation.type === 'Aggregation' || relation.type === 'Composition') {
        // El contenedor gestiona los componentes
        if (!map.has(relation.from)) map.set(relation.from, []);
        map.get(relation.from)!.push({
          type: relation.type,
          targetClass: toClass,
          targetClassId: relation.to,
          isOwner: true
        });
      }
    }
    
    return map;
  }

  private detectManyToManyAssignments(diagramContent: DiagramContent): any[] {
    const assignments: any[] = [];
    
    for (const [relId, relation] of Object.entries(diagramContent.relations)) {
      if (relation.type === 'ManyToMany') {
        const classA = diagramContent.elements[relation.from]?.name;
        const classB = diagramContent.elements[relation.to]?.name;
        
        if (!classA || !classB) continue;
        
        const [first, second] = [classA, classB].sort();
        assignments.push({
          classA: first,
          classB: second,
          classAId: relation.from,
          classBId: relation.to,
          fileName: this.toSnakeCase(`${first}_${second}_assignment`)
        });
      }
    }
    
    return assignments;
  }

  private generateEnvFile(): string {
    return `# API Backend Configuration
API_BASE_URL=http://localhost:3000/api
API_TIMEOUT=30000
`;
  }

  private generatePubspecYaml(projectName: string): string {
    return `name: ${this.toSnakeCase(projectName)}
description: Flutter app generated from UML diagram
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  
  # State Management
  provider: ^6.1.1
  
  # HTTP & API
  http: ^1.1.0
  flutter_dotenv: ^5.1.0
  
  # UI Components
  cupertino_icons: ^1.0.6
  flutter_spinkit: ^5.2.0
  
  # Forms
  flutter_form_builder: ^9.1.1
  form_builder_validators: ^9.1.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.1

flutter:
  uses-material-design: true
  assets:
    - .env
`;
  }

  private generateConfigDart(): string {
    return `import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  static String get apiBaseUrl => dotenv.env['API_BASE_URL'] ?? 'http://localhost:3000/api';
  static int get apiTimeout => int.parse(dotenv.env['API_TIMEOUT'] ?? '30000');
  
  static Future<void> initialize() async {
    await dotenv.load(fileName: ".env");
  }
}
`;
  }

  private generateMainDart(diagramContent: DiagramContent): string {
    const imports = Object.values(diagramContent.elements)
      .map(e => `import 'services/${this.toSnakeCase(e.name)}_service.dart';`)
      .join('\n');
    
    const providers = Object.values(diagramContent.elements)
      .map(e => `        ChangeNotifierProvider(create: (_) => ${e.name}Service()),`)
      .join('\n');
    
    return `import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:provider/provider.dart';
import 'config.dart';
import 'screens/home_screen.dart';
${imports}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppConfig.initialize();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
${providers}
      ],
      child: MaterialApp(
        title: 'Generated App',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
          useMaterial3: true,
          inputDecorationTheme: InputDecorationTheme(
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            filled: true,
            fillColor: Colors.grey[50],
          ),
        ),
        home: const HomeScreen(),
      ),
    );
  }
}
`;
  }

  private generateHomeScreen(diagramContent: DiagramContent): string {
    const imports = Object.values(diagramContent.elements)
      .map(e => `import 'forms/${this.toSnakeCase(e.name)}_form.dart';`)
      .join('\n');
    
    const tiles = Object.values(diagramContent.elements)
      .map(e => `          _buildNavigationTile(
            context,
            '${e.name}',
            Icons.class_,
            ${e.name}FormScreen(),
          ),`)
      .join('\n');
    
    return `import 'package:flutter/material.dart';
${imports}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Entity Management'),
        centerTitle: true,
        elevation: 0,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: GridView.count(
            crossAxisCount: 2,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
            children: [
${tiles}
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavigationTile(
    BuildContext context,
    String title,
    IconData icon,
    Widget destination,
  ) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => destination),
        ),
        borderRadius: BorderRadius.circular(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 48, color: Theme.of(context).primaryColor),
            const SizedBox(height: 12),
            Text(
              title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
`;
  }

  private generateModel(classElement: ClassElement, relationships: RelationshipInfo[]): string {
    const className = classElement.name;
    const attributes = classElement.attributes;
    
    // Campos del modelo
    const fields = attributes.map(attr => {
      const dartType = this.mapJavaToDartType(attr.type);
      return `  ${dartType}? ${this.toCamelCase(attr.name)};`;
    }).join('\n');
    
    // Campos de relaciones FK
    const fkFields = relationships
      .filter(rel => rel.isOwner && (rel.type === 'ManyToOne' || rel.type === 'OneToOne'))
      .map(rel => `  int? ${this.toCamelCase(rel.targetClass)}Id;`)
      .join('\n');
    
    // Constructor
    const constructorParams = [
      ...attributes.map(attr => `this.${this.toCamelCase(attr.name)}`),
      ...relationships
        .filter(rel => rel.isOwner && (rel.type === 'ManyToOne' || rel.type === 'OneToOne'))
        .map(rel => `this.${this.toCamelCase(rel.targetClass)}Id`)
    ].join(', ');
    
    // fromJson
    const fromJsonFields = [
      ...attributes.map(attr => {
        const fieldName = this.toCamelCase(attr.name);
        const dartType = this.mapJavaToDartType(attr.type);
        return `      ${fieldName}: json['${fieldName}'] as ${dartType}?`;
      }),
      ...relationships
        .filter(rel => rel.isOwner && (rel.type === 'ManyToOne' || rel.type === 'OneToOne'))
        .map(rel => {
          const fieldName = `${this.toCamelCase(rel.targetClass)}Id`;
          return `      ${fieldName}: json['${fieldName}'] as int?`;
        })
    ].join(',\n');
    
    // toJson
    const toJsonFields = [
      ...attributes.map(attr => {
        const fieldName = this.toCamelCase(attr.name);
        return `      '${fieldName}': ${fieldName}`;
      }),
      ...relationships
        .filter(rel => rel.isOwner && (rel.type === 'ManyToOne' || rel.type === 'OneToOne'))
        .map(rel => {
          const fieldName = `${this.toCamelCase(rel.targetClass)}Id`;
          return `      '${fieldName}': ${fieldName}`;
        })
    ].join(',\n');
    
    return `class ${className} {
${fields}
${fkFields}

  ${className}({${constructorParams}});

  factory ${className}.fromJson(Map<String, dynamic> json) {
    return ${className}(
${fromJsonFields},
    );
  }

  Map<String, dynamic> toJson() {
    return {
${toJsonFields},
    };
  }
}
`;
  }

  private generateService(classElement: ClassElement, basePackage: string): string {
    const className = classElement.name;
    const endpoint = this.toKebabCase(className);
    const varName = this.toCamelCase(className);
    
    return `import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config.dart';
import '../models/${this.toSnakeCase(className)}.dart';

class ${className}Service extends ChangeNotifier {
  List<${className}> _items = [];
  bool _isLoading = false;
  String? _error;

  List<${className}> get items => _items;
  bool get isLoading => _isLoading;
  String? get error => _error;

  final String _baseUrl = '\${AppConfig.apiBaseUrl}/${endpoint}';

  Future<void> fetchAll() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await http.get(
        Uri.parse(_baseUrl),
        headers: {'Content-Type': 'application/json'},
      ).timeout(Duration(milliseconds: AppConfig.apiTimeout));

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        _items = data.map((json) => ${className}.fromJson(json)).toList();
      } else {
        _error = 'Failed to load data: \${response.statusCode}';
      }
    } catch (e) {
      _error = 'Error: \$e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<${className}?> fetchById(int id) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/$id'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(Duration(milliseconds: AppConfig.apiTimeout));

      if (response.statusCode == 200) {
        return ${className}.fromJson(json.decode(response.body));
      }
    } catch (e) {
      _error = 'Error: \$e';
      notifyListeners();
    }
    return null;
  }

  Future<bool> create(${className} ${varName}) async {
    try {
      final response = await http.post(
        Uri.parse(_baseUrl),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(${varName}.toJson()),
      ).timeout(Duration(milliseconds: AppConfig.apiTimeout));

      if (response.statusCode == 201) {
        await fetchAll();
        return true;
      }
    } catch (e) {
      _error = 'Error: \$e';
      notifyListeners();
    }
    return false;
  }

  Future<bool> update(int id, ${className} ${varName}) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/$id'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(${varName}.toJson()),
      ).timeout(Duration(milliseconds: AppConfig.apiTimeout));

      if (response.statusCode == 200) {
        await fetchAll();
        return true;
      }
    } catch (e) {
      _error = 'Error: \$e';
      notifyListeners();
    }
    return false;
  }

  Future<bool> delete(int id) async {
    try {
      final response = await http.delete(
        Uri.parse('$_baseUrl/$id'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(Duration(milliseconds: AppConfig.apiTimeout));

      if (response.statusCode == 204) {
        await fetchAll();
        return true;
      }
    } catch (e) {
      _error = 'Error: \$e';
      notifyListeners();
    }
    return false;
  }
}
`;
  }

  // Continuará en el siguiente artefacto...
  
  private toSnakeCase(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }

  private toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  private toKebabCase(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
  }

  private mapJavaToDartType(javaType: string): string {
    const typeMap: Record<string, string> = {
      'String': 'String',
      'Integer': 'int',
      'Long': 'int',
      'Double': 'double',
      'Float': 'double',
      'Boolean': 'bool',
      'Date': 'DateTime',
      'LocalDate': 'DateTime',
      'LocalDateTime': 'DateTime',
      'BigDecimal': 'double',
    };
    return typeMap[javaType] || 'String';
  }

  // Métodos de generación de formularios
  private generateFormScreen(
    classElement: ClassElement,
    relationships: RelationshipInfo[],
    diagramContent: DiagramContent,
    classId: string
  ): string {
    // Importar y usar directamente los métodos estáticos
    const { FlutterFormGenerator } = require('./generators/flutter-form-generator');
    const { FlutterFormGeneratorHelpers } = require('./generators/flutter-form-generator-helpers');
    
    // Vincular métodos de helpers al generador principal
    FlutterFormGenerator['generateFormFields'] = FlutterFormGeneratorHelpers.generateFormFields;
    FlutterFormGenerator['generateFKServiceLoads'] = FlutterFormGeneratorHelpers.generateFKServiceLoads;
    FlutterFormGenerator['generateLoadExistingData'] = FlutterFormGeneratorHelpers.generateLoadExistingData;
    FlutterFormGenerator['generateSaveMethod'] = FlutterFormGeneratorHelpers.generateSaveMethod;
    FlutterFormGenerator['generateSaveDataMapping'] = FlutterFormGeneratorHelpers.generateSaveDataMapping;
    FlutterFormGenerator['generateCompositionForm'] = FlutterFormGeneratorHelpers.generateCompositionForm;
    FlutterFormGenerator['generateManyToManyAssignmentForm'] = FlutterFormGeneratorHelpers.generateManyToManyAssignmentForm;
    FlutterFormGenerator['getDisplayField'] = FlutterFormGeneratorHelpers['getDisplayField'];

    return FlutterFormGenerator.generateFormScreen(
      classElement,
      relationships,
      diagramContent,
      classId
    );
  }

  private generateManyToManyAssignmentForm(assignment: any, diagramContent: DiagramContent): string {
    const { FlutterFormGeneratorHelpers } = require('./generators/flutter-form-generator-helpers');
    return FlutterFormGeneratorHelpers.generateManyToManyAssignmentForm(assignment, diagramContent);
  }

  private generateCustomDropdown(): string {
    const { FlutterWidgetsGenerator } = require('./generators/flutter-widgets-generator');
    return FlutterWidgetsGenerator.generateCustomDropdown();
  }

  private generateNestedListWidget(): string {
    const { FlutterWidgetsGenerator } = require('./generators/flutter-widgets-generator');
    return FlutterWidgetsGenerator.generateNestedListWidget();
  }

  private generateLoadingWidget(): string {
    const { FlutterWidgetsGenerator } = require('./generators/flutter-widgets-generator');
    return FlutterWidgetsGenerator.generateLoadingWidget();
  }

  private generateErrorWidget(): string {
    const { FlutterWidgetsGenerator } = require('./generators/flutter-widgets-generator');
    return FlutterWidgetsGenerator.generateErrorWidget();
  }

  private generateEmptyStateWidget(): string {
    const { FlutterWidgetsGenerator } = require('./generators/flutter-widgets-generator');
    return FlutterWidgetsGenerator.generateEmptyStateWidget();
  }
}