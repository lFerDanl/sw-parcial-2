// src/diagrams/generators/flutter-form-generator.ts (Parte 1/2)

interface Attribute {
  name: string;
  type: string;
}

interface ClassElement {
  name: string;
  position: { x: number; y: number };
  attributes: Attribute[];
}

interface RelationshipInfo {
  type: 'OneToMany' | 'ManyToOne' | 'ManyToMany' | 'OneToOne' | 'Inheritance' | 'Aggregation' | 'Composition';
  targetClass: string;
  targetClassId: string;
  isOwner: boolean;
}

interface DiagramContent {
  elements: Record<string, ClassElement>;
  relations: Record<string, any>;
}

export class FlutterFormGenerator {
  
  static generateFormScreen(
    classElement: ClassElement,
    relationships: RelationshipInfo[],
    diagramContent: DiagramContent,
    classId: string
  ): string {
    const hasInheritance = relationships.some(r => r.type === 'Inheritance');
    const hasCompositionOrAggregation = relationships.some(r => 
      r.type === 'Composition' || r.type === 'Aggregation'
    );
    
    if (hasInheritance) {
      return this.generateInheritanceForm(classElement, relationships, diagramContent);
    }
    
    if (hasCompositionOrAggregation) {
      return this.generateCompositionForm(classElement, relationships, diagramContent);
    }
    
    return this.generateStandardForm(classElement, relationships, diagramContent);
  }

  private static generateStandardForm(
    classElement: ClassElement,
    relationships: RelationshipInfo[],
    diagramContent: DiagramContent
  ): string {
    const className = classElement.name;
    const imports = this.generateImports(className, relationships, diagramContent);
    
    const controllers = classElement.attributes
      .filter(attr => attr.name !== 'id')
      .map(attr => `  final ${this.toCamelCase(attr.name)}Controller = TextEditingController();`)
      .join('\n');
    
    const fkRelationships = relationships.filter(r => 
      r.isOwner && (r.type === 'ManyToOne' || r.type === 'OneToOne')
    );
    
    const fkDropdownStates = fkRelationships
      .map(rel => `  int? selected${rel.targetClass}Id;`)
      .join('\n');
    
    const disposeControllers = classElement.attributes
      .filter(attr => attr.name !== 'id')
      .map(attr => `    ${this.toCamelCase(attr.name)}Controller.dispose();`)
      .join('\n');
    
    const formFields = this.generateFormFields(classElement, fkRelationships, diagramContent);
    const saveMethod = this.generateSaveMethod(className, classElement, fkRelationships);
    
    return `import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
${imports}

class ${className}FormScreen extends StatefulWidget {
  final int? ${this.toCamelCase(className)}Id;
  
  const ${className}FormScreen({super.key, this.${this.toCamelCase(className)}Id});

  @override
  State<${className}FormScreen> createState() => _${className}FormScreenState();
}

class _${className}FormScreenState extends State<${className}FormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  
${controllers}
${fkDropdownStates}

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
${disposeControllers}
    super.dispose();
  }

  Future<void> _loadData() async {
    // Usar addPostFrameCallback para evitar llamar setState durante build
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final service = Provider.of<${className}Service>(context, listen: false);
${this.generateFKServiceLoads(fkRelationships)}
      
      if (widget.${this.toCamelCase(className)}Id != null) {
        final item = await service.fetchById(widget.${this.toCamelCase(className)}Id!);
        if (item != null && mounted) {
          setState(() {
${this.generateLoadExistingData(classElement, fkRelationships)}
          });
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.${this.toCamelCase(className)}Id == null ? 'Create ${className}' : 'Edit ${className}'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
${formFields}
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: _save,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text(
                        'Save',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

${saveMethod}
}
`;
  }

  private static generateInheritanceForm(
    classElement: ClassElement,
    relationships: RelationshipInfo[],
    diagramContent: DiagramContent
  ): string {
    const className = classElement.name;
    const subclasses = this.findSubclasses(classElement.name, diagramContent);
    const imports = this.generateImports(className, relationships, diagramContent);
    
    const controllers = classElement.attributes
      .filter(attr => attr.name !== 'id')
      .map(attr => `  final ${this.toCamelCase(attr.name)}Controller = TextEditingController();`)
      .join('\n');
    
    const subclassControllers = subclasses.map(sub => {
      const subAttrs = diagramContent.elements[sub.id].attributes
        .filter(attr => !classElement.attributes.some(pa => pa.name === attr.name));
      return subAttrs
        .map(attr => `  final ${this.toCamelCase(sub.name)}_${this.toCamelCase(attr.name)}Controller = TextEditingController();`)
        .join('\n');
    }).join('\n');
    
    const disposeControllers = [
      ...classElement.attributes
        .filter(attr => attr.name !== 'id')
        .map(attr => `    ${this.toCamelCase(attr.name)}Controller.dispose();`),
      ...subclasses.flatMap(sub => {
        const subAttrs = diagramContent.elements[sub.id].attributes
          .filter(attr => !classElement.attributes.some(pa => pa.name === attr.name));
        return subAttrs.map(attr => 
          `    ${this.toCamelCase(sub.name)}_${this.toCamelCase(attr.name)}Controller.dispose();`
        );
      })
    ].join('\n');
    
    const subclassDropdownItems = subclasses
      .map(sub => `                DropdownMenuItem(value: '${sub.name}', child: Text('${sub.name}')),`)
      .join('\n');
    
    const subclassConditionalFields = subclasses.map(sub => {
      const subAttrs = diagramContent.elements[sub.id].attributes
        .filter(attr => !classElement.attributes.some(pa => pa.name === attr.name));
      
      const fields = subAttrs.map(attr => {
        const fieldName = this.toCamelCase(attr.name);
        const controllerName = `${this.toCamelCase(sub.name)}_${fieldName}Controller`;
        return `                    const SizedBox(height: 16),
                    TextFormField(
                      controller: ${controllerName},
                      decoration: InputDecoration(
                        labelText: '${this.capitalize(fieldName)}',
                        prefixIcon: const Icon(Icons.edit),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Please enter ${fieldName}';
                        }
                        return null;
                      },
                    ),`;
      }).join('\n');
      
      return `            if (selectedSubclass == '${sub.name}') ...[
${fields}
              ],`;
    }).join('\n');
    
    return `import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
${imports}

class ${className}FormScreen extends StatefulWidget {
  final int? ${this.toCamelCase(className)}Id;
  
  const ${className}FormScreen({super.key, this.${this.toCamelCase(className)}Id});

  @override
  State<${className}FormScreen> createState() => _${className}FormScreenState();
}

class _${className}FormScreenState extends State<${className}FormScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  String? selectedSubclass;
  
${controllers}
${subclassControllers}

  @override
  void dispose() {
${disposeControllers}
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.${this.toCamelCase(className)}Id == null ? 'Create ${className}' : 'Edit ${className}'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    DropdownButtonFormField<String>(
                      value: selectedSubclass,
                      decoration: const InputDecoration(
                        labelText: 'Select Type',
                        prefixIcon: Icon(Icons.category),
                      ),
                      items: [
${subclassDropdownItems}
                      ],
                      onChanged: (value) {
                        setState(() {
                          selectedSubclass = value;
                        });
                      },
                      validator: (value) {
                        if (value == null) return 'Please select a type';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
${this.generateFormFields(classElement, [], diagramContent)}
${subclassConditionalFields}
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: _save,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: const Text('Save'),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    final service = Provider.of<${className}Service>(context, listen: false);
    
    final data = ${className}(
${this.generateSaveDataMapping(classElement, [])}
    );

    bool success;
    if (widget.${this.toCamelCase(className)}Id == null) {
      success = await service.create(data);
    } else {
      success = await service.update(widget.${this.toCamelCase(className)}Id!, data);
    }

    setState(() => _isLoading = false);

    if (mounted) {
      if (success) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Saved successfully')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(service.error ?? 'Failed to save')),
        );
      }
    }
  }
}
`;
  }

  // Helper methods
  private static generateImports(
    className: string,
    relationships: RelationshipInfo[],
    diagramContent: DiagramContent
  ): string {
    const imports = [
      `import '/models/${this.toSnakeCase(className)}.dart';`,
      `import '/services/${this.toSnakeCase(className)}_service.dart';`,
    ];
    
    for (const rel of relationships) {
      if (rel.isOwner && (rel.type === 'ManyToOne' || rel.type === 'OneToOne')) {
        imports.push(`import '/models/${this.toSnakeCase(rel.targetClass)}.dart';`);
        imports.push(`import '/services/${this.toSnakeCase(rel.targetClass)}_service.dart';`);
      }
    }
    
    return imports.join('\n');
  }

  private static toSnakeCase(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }

  private static toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  private static toPascalCase(str: string): string {
    return str.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase()).replace(/_/g, '');
  }

  private static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private static findSubclasses(parentClassName: string, diagramContent: DiagramContent): Array<{id: string, name: string}> {
    const subclasses: Array<{ id: string, name: string }> = [];
    
    for (const [relId, relation] of Object.entries(diagramContent.relations)) {
      if (relation.type === 'Inheritance') {
        const parentClass = diagramContent.elements[relation.to];
        if (parentClass && parentClass.name === parentClassName) {
          const childClass = diagramContent.elements[relation.from];
          if (childClass) {
            subclasses.push({ id: relation.from, name: childClass.name });
          }
        }
      }
    }
    
    return subclasses;
  }

  private static mapJavaToDartType(javaType: string): string {
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

  // Métodos que necesitan implementación en Parte 2:
  private static generateCompositionForm(
    classElement: ClassElement,
    relationships: RelationshipInfo[],
    diagramContent: DiagramContent
  ): string {
    // Implementado en Parte 2
    return '';
  }

  static generateManyToManyAssignmentForm(
    assignment: any,
    diagramContent: DiagramContent
  ): string {
    // Implementado en Parte 2
    return '';
  }

  private static generateFormFields(
    classElement: ClassElement,
    fkRelationships: RelationshipInfo[],
    diagramContent: DiagramContent
  ): string {
    // Implementado en Parte 2
    return '';
  }

  private static generateFKServiceLoads(fkRelationships: RelationshipInfo[]): string {
    // Implementado en Parte 2
    return '';
  }

  private static generateLoadExistingData(
    classElement: ClassElement,
    fkRelationships: RelationshipInfo[]
  ): string {
    // Implementado en Parte 2
    return '';
  }

  private static generateSaveMethod(
    className: string,
    classElement: ClassElement,
    fkRelationships: RelationshipInfo[]
  ): string {
    // Implementado en Parte 2
    return '';
  }

  private static generateSaveDataMapping(
    classElement: ClassElement,
    fkRelationships: RelationshipInfo[]
  ): string {
    // Implementado en Parte 2
    return '';
  }

  private static getDisplayField(classElement: ClassElement): string {
    // Implementado en Parte 2
    return 'name';
  }
}