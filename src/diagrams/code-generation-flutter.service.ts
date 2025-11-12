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
    
    const projectFolder = zip.folder(this.toSnakeCase(projectName))!;
    
    // Análisis de relaciones
    const relationshipMap: Map<string, RelationshipInfo[]> = this.analyzeRelationships(diagramContent);
    const manyToManyAssignments: any[] = this.detectManyToManyAssignments(diagramContent);
    
    // Estructura del proyecto Flutter
    const libFolder = projectFolder.folder('lib')!;
    const modelsFolder = libFolder.folder('models')!;
    const servicesFolder = libFolder.folder('services')!;
    const screensFolder = libFolder.folder('screens')!;
    const formsFolder = screensFolder.folder('forms')!;
    const widgetsFolder = libFolder.folder('widgets')!;
    
    // Archivos base
    projectFolder.file('.env', this.generateEnvFile());
    projectFolder.file('pubspec.yaml', this.generatePubspecYaml(projectName));
    projectFolder.file('.gitignore', this.generateGitignore());
    projectFolder.file('.metadata', this.generateMetadata());
    projectFolder.file('analysis_options.yaml', this.generateAnalysisOptions());
    projectFolder.file('README.md', this.generateReadme(projectName));
    
    // Archivos lib
    libFolder.file('main.dart', this.generateMainDart(diagramContent));
    libFolder.file('config.dart', this.generateConfigDart());
    
    // Generar modelos
    for (const [classId, classElement] of Object.entries(diagramContent.elements)) {
      const modelCode = this.generateModel(
        classElement,
        relationshipMap.get(classId) || [],
        diagramContent
      );
      modelsFolder.file(`${this.toSnakeCase(classElement.name)}.dart`, modelCode);
    }
    
    // Generar servicios
    for (const [classId, classElement] of Object.entries(diagramContent.elements)) {
      const serviceCode = this.generateService(classElement, basePackage);
      servicesFolder.file(`${this.toSnakeCase(classElement.name)}_service.dart`, serviceCode);
    }
    
    // Generar formularios CRUD completos
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
    widgetsFolder.file('loading_widget.dart', this.generateLoadingWidget());
    widgetsFolder.file('error_widget.dart', this.generateErrorWidget());
    widgetsFolder.file('empty_state_widget.dart', this.generateEmptyStateWidget());
    
    // Generar pantalla principal
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
      
      if (relation.type === 'ManyToOne') {
        if (!map.has(relation.from)) map.set(relation.from, []);
        map.get(relation.from)!.push({
          type: relation.type,
          targetClass: toClass,
          targetClassId: relation.to,
          isOwner: true
        });
      } else if (relation.type === 'OneToMany') {
        if (!map.has(relation.to)) map.set(relation.to, []);
        map.get(relation.to)!.push({
          type: 'ManyToOne',
          targetClass: fromClass,
          targetClassId: relation.from,
          isOwner: true
        });
      } else if (relation.type === 'ManyToMany') {
        // ManyToMany: el lado dueño es 'from'. El inverso ('to') no es dueño.
        if (!map.has(relation.from)) map.set(relation.from, []);
        map.get(relation.from)!.push({
          type: relation.type,
          targetClass: toClass,
          targetClassId: relation.to,
          isOwner: true
        });
        if (!map.has(relation.to)) map.set(relation.to, []);
        map.get(relation.to)!.push({
          type: relation.type,
          targetClass: fromClass,
          targetClassId: relation.from,
          isOwner: false
        });
      } else if (relation.type === 'OneToOne') {
        if (!map.has(relation.from)) map.set(relation.from, []);
        map.get(relation.from)!.push({
          type: relation.type,
          targetClass: toClass,
          targetClassId: relation.to,
          isOwner: true
        });
      } else if (relation.type === 'Inheritance') {
        if (!map.has(relation.from)) map.set(relation.from, []);
        map.get(relation.from)!.push({
          type: relation.type,
          targetClass: toClass,
          targetClassId: relation.to,
          isOwner: false
        });
      } else if (relation.type === 'Aggregation' || relation.type === 'Composition') {
        // Para Flutter, tratamos la relación como:
        // - Lado padre (from): OneToMany (no propietario para formularios)
        // - Lado hijo (to): ManyToOne (propietario, genera selector FK)

        // Lado padre: OneToMany
        if (!map.has(relation.from)) map.set(relation.from, []);
        map.get(relation.from)!.push({
          type: 'OneToMany',
          targetClass: toClass,
          targetClassId: relation.to,
          isOwner: false
        });

        // Lado hijo: ManyToOne (propietario)
        if (!map.has(relation.to)) map.set(relation.to, []);
        map.get(relation.to)!.push({
          type: 'ManyToOne',
          targetClass: fromClass,
          targetClassId: relation.from,
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
        const ownerName = diagramContent.elements[relation.from]?.name;
        const inverseName = diagramContent.elements[relation.to]?.name;
        
        if (!ownerName || !inverseName) continue;
        
        const [first, second] = [ownerName, inverseName].sort();
        assignments.push({
          // Nombres canónicos para nombre de archivo y pantalla
          classA: first,
          classB: second,
          // Datos de propiedad real
          ownerName,
          ownerId: relation.from,
          inverseName,
          inverseId: relation.to,
          fileName: this.toSnakeCase(`${first}_${second}_assignment`)
        });
      }
    }
    
    return assignments;
  }

  private generateEnvFile(): string {
    return `# API Backend Configuration
API_BASE_URL=http://10.0.2.2:8080/api
API_TIMEOUT=30000
`;
  }

  private generatePubspecYaml(projectName: string): string {
    return `name: ${this.toSnakeCase(projectName)}
description: Flutter app generated from UML diagram
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: ^3.7.2

dependencies:
  flutter:
    sdk: flutter
  
  # State Management
  provider: ^6.1.1
  
  # HTTP & API
  http: ^1.2.0
  flutter_dotenv: ^5.1.0
  
  # UI Components
  cupertino_icons: ^1.0.8
  flutter_spinkit: ^5.2.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0

flutter:
  uses-material-design: true
  assets:
    - .env
`;
  }

  private generateGitignore(): string {
    return `# Miscellaneous
*.class
*.log
*.pyc
*.swp
.DS_Store
.atom/
.build/
.buildlog/
.history
.svn/
.swiftpm/
migrate_working_dir/

# IntelliJ related
*.iml
*.ipr
*.iws
.idea/

# Flutter/Dart/Pub related
**/doc/api/
**/ios/Flutter/.last_build_id
.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
.pub-cache/
.pub/
/build/

# Symbolication related
app.*.symbols

# Obfuscation related
app.*.map.json

# Android Studio will place build artifacts here
/android/app/debug
/android/app/profile
/android/app/release
`;
  }

  private generateMetadata(): string {
    return `# This file tracks properties of this Flutter project.

version:
  revision: "ea121f8859e4b13e47a8f845e4586164519588bc"
  channel: "stable"

project_type: app
`;
  }

  private generateAnalysisOptions(): string {
    return `include: package:flutter_lints/flutter.yaml

linter:
  rules:
    # Add custom rules here
`;
  }

  private generateReadme(projectName: string): string {
    return `# ${projectName}

A Flutter application generated from UML diagram with complete CRUD functionality.

## Features

- ✅ Complete CRUD operations (Create, Read, Update, Delete)
- ✅ List view with cards for each entity
- ✅ Form validation
- ✅ State management with Provider
- ✅ RESTful API integration
- ✅ Loading states and error handling
- ✅ Material Design 3 UI
- ✅ Responsive dialogs and confirmations

## Setup

1. Install dependencies:
\`\`\`bash
flutter pub get
\`\`\`

2. Configure your API endpoint in \`.env\`:
\`\`\`
API_BASE_URL=http://your-api-url/api
API_TIMEOUT=30000
\`\`\`

3. Run the app:
\`\`\`bash
flutter run
\`\`\`

## Project Structure

\`\`\`
lib/
├── models/          # Data models with JSON serialization
├── services/        # API services with Provider
├── screens/         # UI screens
│   └── forms/       # CRUD management screens
├── widgets/         # Reusable widgets
├── config.dart      # App configuration
└── main.dart        # Entry point
\`\`\`

## Usage

Each entity has its own management screen with:
- **List View**: Cards displaying all items from the database
- **Create**: FAB button to open creation form
- **Edit**: Tap on card or menu to edit
- **Delete**: Menu option with confirmation dialog
- **Refresh**: Pull to refresh or refresh button in app bar

The backend is expected to provide REST endpoints following the pattern:
- GET /api/entity-name - List all
- GET /api/entity-name/:id - Get by ID
- POST /api/entity-name - Create
- PUT /api/entity-name/:id - Update
- DELETE /api/entity-name/:id - Delete
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
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF2196F3),
            brightness: Brightness.light,
          ),
          useMaterial3: true,
          appBarTheme: const AppBarTheme(
            centerTitle: true,
            elevation: 0,
          ),
          cardTheme: CardThemeData(
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          inputDecorationTheme: InputDecorationTheme(
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            filled: true,
            fillColor: Colors.grey[50],
          ),
          elevatedButtonTheme: ElevatedButtonThemeData(
            style: ElevatedButton.styleFrom(
              elevation: 2,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
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
    
    const menuItems = Object.values(diagramContent.elements)
      .map(e => `            ListTile(
              leading: Icon(Icons.table_chart, color: Theme.of(context).primaryColor),
              title: Text('${e.name}'),
              subtitle: const Text('Manage records'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ${e.name}FormScreen()),
                );
              },
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
        title: const Text('Dashboard'),
        centerTitle: true,
        elevation: 2,
        backgroundColor: Theme.of(context).primaryColor,
        foregroundColor: Colors.white,
      ),
      drawer: Drawer(
        child: Column(
          children: [
            DrawerHeader(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Theme.of(context).primaryColor,
                    Theme.of(context).primaryColor.withOpacity(0.7),
                  ],
                ),
              ),
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.dashboard, size: 48, color: Colors.white),
                  SizedBox(height: 12),
                  Text(
                    'Entity Management',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'CRUD System',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Text(
                      'ENTITIES',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Colors.grey[600],
                        letterSpacing: 1.2,
                      ),
                    ),
                  ),
${menuItems}
                ],
              ),
            ),
            const Divider(height: 1),
            ListTile(
              leading: Icon(Icons.info_outline, color: Colors.grey[600]),
              title: const Text('About'),
              onTap: () {
                Navigator.pop(context);
                _showAboutDialog(context);
              },
            ),
          ],
        ),
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Theme.of(context).primaryColor.withOpacity(0.05),
              Theme.of(context).primaryColor.withOpacity(0.1),
            ],
          ),
        ),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.dashboard_customize,
                size: 120,
                color: Theme.of(context).primaryColor.withOpacity(0.3),
              ),
              const SizedBox(height: 32),
              Text(
                'Welcome to',
                style: TextStyle(
                  fontSize: 24,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.w300,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Entity Management',
                style: TextStyle(
                  fontSize: 48,
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).primaryColor,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Select an entity from the menu to manage',
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 48),
              Card(
                elevation: 0,
                color: Theme.of(context).primaryColor.withOpacity(0.1),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.menu,
                        color: Theme.of(context).primaryColor,
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'Open the menu to navigate',
                        style: TextStyle(
                          fontSize: 16,
                          color: Theme.of(context).primaryColor,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showAboutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.info_outline, color: Colors.blue),
            SizedBox(width: 12),
            Text('About'),
          ],
        ),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Generated Flutter Application',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            SizedBox(height: 8),
            Text('Version 1.0.0'),
            SizedBox(height: 16),
            Text(
              'This application was automatically generated from a UML diagram with complete CRUD functionality.',
            ),
            SizedBox(height: 8),
            Text(
              'Features:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 4),
            Text('• Complete CRUD operations'),
            Text('• RESTful API integration'),
            Text('• State management with Provider'),
            Text('• Form validation'),
            Text('• Material Design 3'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}
`;
  }

  private generateModel(
    classElement: ClassElement,
    relationships: RelationshipInfo[],
    diagramContent: DiagramContent
  ): string {
    const className = classElement.name;
    const inheritanceRel = relationships.find(r => r.type === 'Inheritance');
    const parentAttrs: Attribute[] = inheritanceRel
      ? (diagramContent.elements[inheritanceRel.targetClassId]?.attributes || [])
      : [];
    const ownAttrs: Attribute[] = classElement.attributes || [];
    // Merge parent + own attributes (parent first), unique by name
    const seen = new Set<string>();
    const attributes: Attribute[] = [];
    for (const a of [...parentAttrs, ...ownAttrs]) {
      const key = (a.name || '').toLowerCase();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      attributes.push(a);
    }
    
    const fields = attributes.map(attr => {
      const dartType = this.mapJavaToDartType(attr.type);
      return `  ${dartType}? ${this.toCamelCase(attr.name)};`;
    }).join('\n');
    
    const fkFields = relationships
      .filter(rel => rel.isOwner && (rel.type === 'ManyToOne' || rel.type === 'OneToOne'))
      .map(rel => `  int? ${this.toCamelCase(rel.targetClass)}Id;`)
      .join('\n');
    // ManyToMany: incluir listas de IDs para ambos lados
    const mmRels = Object.values(diagramContent.relations)
      .filter(r => r.type === 'ManyToMany')
      .filter(r => {
        const fromName = diagramContent.elements[r.from]?.name;
        const toName = diagramContent.elements[r.to]?.name;
        return fromName === className || toName === className;
      });
    const mmFields = mmRels
      .map(r => {
        const fromName = diagramContent.elements[r.from]?.name;
        const toName = diagramContent.elements[r.to]?.name;
        const other = fromName === className ? toName : fromName;
        return `  List<int>? ${this.toCamelCase(other!)}Ids;`;
      })
      .join('\n');
    
    const constructorParams = [
      ...attributes.map(attr => `this.${this.toCamelCase(attr.name)}`),
      ...relationships
        .filter(rel => rel.isOwner && (rel.type === 'ManyToOne' || rel.type === 'OneToOne'))
        .map(rel => `this.${this.toCamelCase(rel.targetClass)}Id`),
      ...mmRels.map(r => {
        const fromName = diagramContent.elements[r.from]?.name;
        const toName = diagramContent.elements[r.to]?.name;
        const other = fromName === className ? toName : fromName;
        return `this.${this.toCamelCase(other!)}Ids`;
      })
    ].join(', ');
    
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
        }),
      ...mmRels.map(r => {
        const fromName = diagramContent.elements[r.from]?.name;
        const toName = diagramContent.elements[r.to]?.name;
        const other = fromName === className ? toName : fromName;
        const fieldName = `${this.toCamelCase(other!)}Ids`;
        return `      ${fieldName}: (json['${fieldName}'] as List?)?.map((e) => e as int).toList()`;
      })
    ].join(',\n');
    
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
        }),
      ...mmRels.map(r => {
        const fromName = diagramContent.elements[r.from]?.name;
        const toName = diagramContent.elements[r.to]?.name;
        const other = fromName === className ? toName : fromName;
        const fieldName = `${this.toCamelCase(other!)}Ids`;
        return `      '${fieldName}': ${fieldName}`;
      })
    ].join(',\n');
    
    return `class ${className} {
${fields}
${fkFields}
${mmFields}

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
import '/config.dart';
import '/models/${this.toSnakeCase(className)}.dart';

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

      if (response.statusCode == 204 || response.statusCode == 200) {
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

  // Método principal para generar formularios
  private generateFormScreen(
    classElement: ClassElement,
    relationships: RelationshipInfo[],
    diagramContent: DiagramContent,
    classId: string
  ): string {
    const { FlutterFormGenerator } = require('./generators/flutter-form-generator');
    
    return FlutterFormGenerator.generateFormScreen(
      classElement,
      relationships,
      diagramContent,
      classId
    );
  }

  private generateManyToManyAssignmentForm(assignment: any, diagramContent: DiagramContent): string {
    // Formulario M:M solo del lado dueño, con selección múltiple
    const { ownerName, inverseName, ownerId, inverseId, fileName } = assignment;

    return `import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '/services/${this.toSnakeCase(ownerName)}_service.dart';
import '/services/${this.toSnakeCase(inverseName)}_service.dart';

class ${this.toPascalCase(fileName)}FormScreen extends StatefulWidget {
  final int? preselectedOwnerId;
  const ${this.toPascalCase(fileName)}FormScreen({super.key, this.preselectedOwnerId});

  @override
  State<${this.toPascalCase(fileName)}FormScreen> createState() => _${this.toPascalCase(fileName)}FormScreenState();
}

class _${this.toPascalCase(fileName)}FormScreenState extends State<${this.toPascalCase(fileName)}FormScreen> {
  int? selectedOwnerId;
  final Set<int> selected${inverseName}Ids = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final ownerSvc = Provider.of<${ownerName}Service>(context, listen: false);
      final inverseSvc = Provider.of<${inverseName}Service>(context, listen: false);
      await ownerSvc.fetchAll();
      await inverseSvc.fetchAll();
      if (widget.preselectedOwnerId != null) {
        selectedOwnerId = widget.preselectedOwnerId;
        final owner = await ownerSvc.fetchById(widget.preselectedOwnerId!);
        final current = owner?.${this.toCamelCase(inverseName)}Ids ?? <int>[];
        selected${inverseName}Ids
          ..clear()
          ..addAll(current.map((e) => e is int ? e : int.tryParse(e.toString()) ?? 0).where((e) => e != 0));
      }
      setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Asignar ${inverseName} a ${ownerName}'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Dueño (solo habilitado si no viene preseleccionado)
            Consumer<${ownerName}Service>(
              builder: (context, service, _) {
                return DropdownButtonFormField<int>(
                  value: selectedOwnerId,
                  decoration: InputDecoration(
                    labelText: 'Selecciona ${ownerName}',
                    border: const OutlineInputBorder(),
                  ),
                  items: service.items.map((item) {
                    return DropdownMenuItem(
                      value: item.id,
                      child: Text('#\${item.id}'),
                    );
                  }).toList(),
                  onChanged: widget.preselectedOwnerId != null ? null : (value) async {
                    setState(() { selectedOwnerId = value; });
                    if (value != null) {
                      final owner = await Provider.of<${ownerName}Service>(context, listen: false).fetchById(value);
                      final current = owner?.${this.toCamelCase(inverseName)}Ids ?? <int>[];
                      setState(() {
                        selected${inverseName}Ids
                          ..clear()
                          ..addAll(current.map((e) => e is int ? e : int.tryParse(e.toString()) ?? 0).where((e) => e != 0));
                      });
                    }
                  },
                );
              },
            ),
            const SizedBox(height: 16),
            // Lista múltiple del inverso
            Expanded(
              child: Consumer<${inverseName}Service>(
                builder: (context, service, _) {
                  if (service.items.isEmpty) {
                    return const Center(child: Text('No hay elementos para asignar'));
                  }
                  return ListView.separated(
                    itemCount: service.items.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final target = service.items[index];
                      final tid = target.id as int;
                      final checked = selected${inverseName}Ids.contains(tid);
                      return CheckboxListTile(
                        value: checked,
                        title: Text('${inverseName} #\${tid}'),
                        onChanged: (val) {
                          setState(() {
                            if (val == true) {
                              selected${inverseName}Ids.add(tid);
                            } else {
                              selected${inverseName}Ids.remove(tid);
                            }
                          });
                        },
                      );
                    },
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.save),
                label: const Text('Guardar asignación'),
                onPressed: () async {
                  if (selectedOwnerId == null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Selecciona el elemento dueño')),
                    );
                    return;
                  }
                  final ownerSvc = Provider.of<${ownerName}Service>(context, listen: false);
                  final owner = await ownerSvc.fetchById(selectedOwnerId!);
                  if (owner == null) return;
                  owner.${this.toCamelCase(inverseName)}Ids = selected${inverseName}Ids.toList();
                  await ownerSvc.update(selectedOwnerId!, owner);
                  if (mounted) Navigator.pop(context);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
`;
  }

  private toPascalCase(str: string): string {
    return str.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase()).replace(/_/g, '');
  }

  private generateCustomDropdown(): string {
    return `import 'package:flutter/material.dart';

class CustomDropdown<T> extends StatelessWidget {
  final String label;
  final T? value;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;
  final String? Function(T?)? validator;
  final IconData? icon;

  const CustomDropdown({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
    this.validator,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<T>(
      value: value,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: icon != null ? Icon(icon) : null,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.grey[50],
      ),
      items: items,
      onChanged: onChanged,
      validator: validator,
      isExpanded: true,
    );
  }
}
`;
  }

  private generateLoadingWidget(): string {
    return `import 'package:flutter/material.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';

class LoadingWidget extends StatelessWidget {
  final String? message;

  const LoadingWidget({super.key, this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SpinKitFadingCircle(
            color: Theme.of(context).primaryColor,
            size: 50.0,
          ),
          if (message != null) ...[
            const SizedBox(height: 16),
            Text(
              message!,
              style: const TextStyle(fontSize: 16, color: Colors.grey),
            ),
          ],
        ],
      ),
    );
  }
}
`;
  }

  private generateErrorWidget(): string {
    return `import 'package:flutter/material.dart';

class ErrorDisplayWidget extends StatelessWidget {
  final String error;
  final VoidCallback? onRetry;

  const ErrorDisplayWidget({
    super.key,
    required this.error,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red.shade400,
            ),
            const SizedBox(height: 16),
            Text(
              'Error',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.red.shade700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              error,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, color: Colors.grey),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
`;
  }

  private generateEmptyStateWidget(): string {
    return `import 'package:flutter/material.dart';

class EmptyStateWidget extends StatelessWidget {
  final String title;
  final String message;
  final IconData icon;
  final VoidCallback? onAction;
  final String? actionLabel;

  const EmptyStateWidget({
    super.key,
    required this.title,
    required this.message,
    this.icon = Icons.inbox,
    this.onAction,
    this.actionLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 80,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 24),
            Text(
              title,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
              ),
            ),
            if (onAction != null && actionLabel != null) ...[
              const SizedBox(height: 32),
              ElevatedButton.icon(
                onPressed: onAction,
                icon: const Icon(Icons.add),
                label: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
`;
  }
}