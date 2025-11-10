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
    
    // Crear carpeta raíz con el nombre del proyecto
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
    
    // Archivos base en la raíz del proyecto
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

# The .vscode folder contains launch configuration and tasks you configure in
# VS Code which you may wish to be included in version control, so this line
# is commented out by default.
#.vscode/

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
# Used by Flutter tool to assess capabilities and perform upgrades etc.
#
# This file should be version controlled and should not be manually edited.

version:
  revision: "ea121f8859e4b13e47a8f845e4586164519588bc"
  channel: "stable"

project_type: app

# Tracks metadata for the flutter migrate command
migration:
  platforms:
    - platform: root
      create_revision: ea121f8859e4b13e47a8f845e4586164519588bc
      base_revision: ea121f8859e4b13e47a8f845e4586164519588bc
    - platform: android
      create_revision: ea121f8859e4b13e47a8f845e4586164519588bc
      base_revision: ea121f8859e4b13e47a8f845e4586164519588bc
    - platform: ios
      create_revision: ea121f8859e4b13e47a8f845e4586164519588bc
      base_revision: ea121f8859e4b13e47a8f845e4586164519588bc
    - platform: linux
      create_revision: ea121f8859e4b13e47a8f845e4586164519588bc
      base_revision: ea121f8859e4b13e47a8f845e4586164519588bc
    - platform: macos
      create_revision: ea121f8859e4b13e47a8f845e4586164519588bc
      base_revision: ea121f8859e4b13e47a8f845e4586164519588bc
    - platform: web
      create_revision: ea121f8859e4b13e47a8f845e4586164519588bc
      base_revision: ea121f8859e4b13e47a8f845e4586164519588bc
    - platform: windows
      create_revision: ea121f8859e4b13e47a8f845e4586164519588bc
      base_revision: ea121f8859e4b13e47a8f845e4586164519588bc

  # User provided section

  # List of Local paths (relative to this file) that should be
  # ignored by the migrate tool.
  #
  # Files that are not part of the templates will be ignored by default.
  unmanaged_files:
    - 'lib/main.dart'
    - 'ios/Runner.xcodeproj/project.pbxproj'
`;
  }

  private generateAnalysisOptions(): string {
    return `# This file configures the analyzer, which statically analyzes Dart code to
# check for errors, warnings, and lints.
#
# The issues identified by the analyzer are surfaced in the UI of Dart-enabled
# IDEs (https://dart.dev/tools#ides-and-editors). The analyzer can also be
# invoked from the command line by running \`flutter analyze\`.

# The following line activates a set of recommended lints for Flutter apps,
# packages, and plugins designed to encourage good coding practices.
include: package:flutter_lints/flutter.yaml

linter:
  # The lint rules applied to this project can be customized in the
  # section below to disable rules from the \`package:flutter_lints/flutter.yaml\`
  # included above or to enable additional rules. A list of all available lints
  # and their documentation is published at https://dart.dev/lints.
  #
  # Instead of disabling a lint rule for the entire project in the
  # section below, it can also be suppressed for a single line of code
  # or a specific dart file by using the \`// ignore: name_of_lint\` and
  # \`// ignore_for_file: name_of_lint\` syntax on the line or in the file
  # producing the lint.
  rules:
    # avoid_print: false  # Uncomment to disable the \`avoid_print\` rule
    # prefer_single_quotes: true  # Uncomment to enable the \`prefer_single_quotes\` rule

# Additional information about this file can be found at
# https://dart.dev/guides/language/analysis-options
`;
  }

  private generateReadme(projectName: string): string {
    return `# ${projectName}

A Flutter application generated from UML diagram.

## Getting Started

This project was automatically generated and includes:

- **Models**: Data classes with JSON serialization
- **Services**: HTTP client services with Provider state management
- **Screens**: CRUD forms for all entities
- **Widgets**: Reusable UI components

## Prerequisites

- Flutter SDK (>=3.7.2)
- Dart SDK
- A running backend API

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
├── models/          # Data models
├── services/        # API services
├── screens/         # UI screens
│   └── forms/       # CRUD forms
├── widgets/         # Reusable widgets
├── config.dart      # App configuration
└── main.dart        # Entry point
\`\`\`

## Features

- State management with Provider
- RESTful API integration
- Form validation
- Error handling
- Loading states
- Material Design 3 UI

## Resources

- [Flutter Documentation](https://docs.flutter.dev/)
- [Dart Documentation](https://dart.dev/guides)
- [Provider Package](https://pub.dev/packages/provider)
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
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => ${e.name}FormScreen()),
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
                    'Generated App',
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
                      'Entities',
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
                'Select an entity from the menu to get started',
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
              'This application was automatically generated from a UML diagram.',
            ),
            SizedBox(height: 8),
            Text(
              'Features:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 4),
            Text('• CRUD operations for all entities'),
            Text('• RESTful API integration'),
            Text('• State management with Provider'),
            Text('• Form validation'),
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