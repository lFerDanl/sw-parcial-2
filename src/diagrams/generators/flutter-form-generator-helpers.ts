// src/diagrams/generators/flutter-form-generator-helpers.ts (Parte 2/2)
// Este archivo contiene los métodos auxiliares del FlutterFormGenerator

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
  
  export class FlutterFormGeneratorHelpers {
    
    static generateCompositionForm(
      classElement: ClassElement,
      relationships: RelationshipInfo[],
      diagramContent: DiagramContent
    ): string {
      const className = classElement.name;
      const compositionRels = relationships.filter(r => 
        r.type === 'Composition' || r.type === 'Aggregation'
      );
      
      const imports = [
        this.generateBasicImports(className),
        ...compositionRels.map(rel => 
          `import '../models/${this.toSnakeCase(rel.targetClass)}.dart';`
        ),
        `import '../../widgets/nested_list_widget.dart';`
      ].join('\n');
      
      const controllers = classElement.attributes
        .filter(attr => attr.name !== 'id')
        .map(attr => `  final ${this.toCamelCase(attr.name)}Controller = TextEditingController();`)
        .join('\n');
      
      const nestedLists = compositionRels
        .map(rel => `  List<${rel.targetClass}> ${this.toCamelCase(rel.targetClass)}List = [];`)
        .join('\n');
      
      const nestedWidgets = compositionRels.map(rel => {
        const targetClass = diagramContent.elements[rel.targetClassId];
        const displayFields = targetClass.attributes
          .filter(a => a.name !== 'id')
          .slice(0, 2)
          .map(a => this.toCamelCase(a.name));
        
        return `                    const SizedBox(height: 24),
                      NestedListWidget<${rel.targetClass}>(
                        title: '${rel.targetClass} Items',
                        items: ${this.toCamelCase(rel.targetClass)}List,
                        onAdd: () => _show${rel.targetClass}Dialog(),
                        onEdit: (item, index) => _show${rel.targetClass}Dialog(item: item, index: index),
                        onDelete: (index) {
                          setState(() {
                            ${this.toCamelCase(rel.targetClass)}List.removeAt(index);
                          });
                        },
                        itemBuilder: (item) => '${displayFields.map(f => '\${item.${f}}').join(' - ')}',
                      ),`;
      }).join('\n');
      
      const dialogMethods = compositionRels.map(rel => 
        this.generateNestedItemDialog(rel.targetClass, diagramContent.elements[rel.targetClassId])
      ).join('\n\n');
      
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
  ${nestedLists}
  
    @override
    void dispose() {
  ${classElement.attributes.filter(a => a.name !== 'id').map(a => 
      `    ${this.toCamelCase(a.name)}Controller.dispose();`
    ).join('\n')}
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
  ${this.generateSimpleFormFields(classElement)}
  ${nestedWidgets}
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
  ${this.generateSimpleSaveMapping(classElement)}
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
  
  ${dialogMethods}
  }
  `;
    }
  
    static generateManyToManyAssignmentForm(
      assignment: any,
      diagramContent: DiagramContent
    ): string {
      const { classA, classB, classAId, classBId, fileName } = assignment;
      
      return `import 'package:flutter/material.dart';
  import 'package:provider/provider.dart';
  import '../services/${this.toSnakeCase(classA)}_service.dart';
  import '../services/${this.toSnakeCase(classB)}_service.dart';
  import '../models/${this.toSnakeCase(classA)}.dart';
  import '../models/${this.toSnakeCase(classB)}.dart';
  
  class ${this.toPascalCase(fileName)}FormScreen extends StatefulWidget {
    const ${this.toPascalCase(fileName)}FormScreen({super.key});
  
    @override
    State<${this.toPascalCase(fileName)}FormScreen> createState() => _${this.toPascalCase(fileName)}FormScreenState();
  }
  
  class _${this.toPascalCase(fileName)}FormScreenState extends State<${this.toPascalCase(fileName)}FormScreen> {
    final _formKey = GlobalKey<FormState>();
    int? selected${classA}Id;
    int? selected${classB}Id;
    bool _isLoading = false;
  
    @override
    void initState() {
      super.initState();
      _loadData();
    }
  
    Future<void> _loadData() async {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        final ${this.toCamelCase(classA)}Service = Provider.of<${classA}Service>(context, listen: false);
        final ${this.toCamelCase(classB)}Service = Provider.of<${classB}Service>(context, listen: false);
        
        await Future.wait([
          ${this.toCamelCase(classA)}Service.fetchAll(),
          ${this.toCamelCase(classB)}Service.fetchAll(),
        ]);
      });
    }
  
    @override
    Widget build(BuildContext context) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Assign ${classA} to ${classB}'),
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
                      Consumer<${classA}Service>(
                        builder: (context, service, _) {
                          if (service.isLoading) {
                            return const CircularProgressIndicator();
                          }
                          return DropdownButtonFormField<int>(
                            value: selected${classA}Id,
                            decoration: InputDecoration(
                              labelText: 'Select ${classA}',
                              prefixIcon: const Icon(Icons.person),
                            ),
                            items: service.items.map((item) {
                              return DropdownMenuItem(
                                value: item.id,
                                child: Text(item.${this.toCamelCase(this.getDisplayField(diagramContent.elements[classAId]))} ?? 'N/A'),
                              );
                            }).toList(),
                            onChanged: (value) {
                              setState(() {
                                selected${classA}Id = value;
                              });
                            },
                            validator: (value) {
                              if (value == null) return 'Please select a ${classA}';
                              return null;
                            },
                          );
                        },
                      ),
                      const SizedBox(height: 16),
                      Consumer<${classB}Service>(
                        builder: (context, service, _) {
                          if (service.isLoading) {
                            return const CircularProgressIndicator();
                          }
                          return DropdownButtonFormField<int>(
                            value: selected${classB}Id,
                            decoration: InputDecoration(
                              labelText: 'Select ${classB}',
                              prefixIcon: const Icon(Icons.business),
                            ),
                            items: service.items.map((item) {
                              return DropdownMenuItem(
                                value: item.id,
                                child: Text(item.${this.toCamelCase(this.getDisplayField(diagramContent.elements[classBId]))} ?? 'N/A'),
                              );
                            }).toList(),
                            onChanged: (value) {
                              setState(() {
                                selected${classB}Id = value;
                              });
                            },
                            validator: (value) {
                              if (value == null) return 'Please select a ${classB}';
                              return null;
                            },
                          );
                        },
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: _save,
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        child: const Text('Create Assignment'),
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
  
      // TODO: Implementar lógica de guardado en el backend
      // Esto requeriría un endpoint específico para la tabla intermedia
      
      await Future.delayed(const Duration(seconds: 1));
  
      setState(() => _isLoading = false);
  
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Assignment created successfully')),
        );
      }
    }
  }
  `;
    }
  
    static generateFormFields(
      classElement: ClassElement,
      fkRelationships: RelationshipInfo[],
      diagramContent: DiagramContent
    ): string {
      const fields: string[] = [];
      
      for (const attr of classElement.attributes) {
        if (attr.name === 'id') continue;
        
        const fieldName = this.toCamelCase(attr.name);
        const dartType = this.mapJavaToDartType(attr.type);
        
        let inputType = 'TextInputType.text';
        if (dartType === 'int' || dartType === 'double') {
          inputType = 'TextInputType.number';
        }
        
        fields.push(`                    TextFormField(
                        controller: ${fieldName}Controller,
                        decoration: InputDecoration(
                          labelText: '${this.capitalize(fieldName)}',
                          prefixIcon: const Icon(Icons.edit),
                        ),
                        keyboardType: ${inputType},
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'Please enter ${fieldName}';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),`);
      }
      
      for (const rel of fkRelationships) {
        const targetClass = rel.targetClass;
        const displayField = this.getDisplayField(diagramContent.elements[rel.targetClassId]);
        
        fields.push(`                    Consumer<${targetClass}Service>(
                        builder: (context, service, _) {
                          if (service.isLoading) {
                            return const CircularProgressIndicator();
                          }
                          return DropdownButtonFormField<int>(
                            value: selected${targetClass}Id,
                            decoration: InputDecoration(
                              labelText: 'Select ${targetClass}',
                              prefixIcon: const Icon(Icons.link),
                            ),
                            items: service.items.map((item) {
                              return DropdownMenuItem(
                                value: item.id,
                                child: Text(item.${this.toCamelCase(displayField)} ?? 'N/A'),
                              );
                            }).toList(),
                            onChanged: (value) {
                              setState(() {
                                selected${targetClass}Id = value;
                              });
                            },
                            validator: (value) {
                              if (value == null) return 'Please select a ${targetClass}';
                              return null;
                            },
                          );
                        },
                      ),
                      const SizedBox(height: 16),`);
      }
      
      return fields.join('\n');
    }
  
    static generateFKServiceLoads(fkRelationships: RelationshipInfo[]): string {
      return fkRelationships
        .map(rel => `        await Provider.of<${rel.targetClass}Service>(context, listen: false).fetchAll();`)
        .join('\n');
    }
  
    static generateLoadExistingData(
      classElement: ClassElement,
      fkRelationships: RelationshipInfo[]
    ): string {
      const loads = classElement.attributes
        .filter(attr => attr.name !== 'id')
        .map(attr => {
          const fieldName = this.toCamelCase(attr.name);
          return `          ${fieldName}Controller.text = item.${fieldName}?.toString() ?? '';`;
        });
      
      loads.push(...fkRelationships.map(rel => 
        `          selected${rel.targetClass}Id = item.${this.toCamelCase(rel.targetClass)}Id;`
      ));
      
      return loads.join('\n');
    }
  
    static generateSaveMethod(
      className: string,
      classElement: ClassElement,
      fkRelationships: RelationshipInfo[]
    ): string {
      return `  Future<void> _save() async {
      if (!_formKey.currentState!.validate()) return;
  
      setState(() => _isLoading = true);
  
      final service = Provider.of<${className}Service>(context, listen: false);
      
      final data = ${className}(
  ${this.generateSaveDataMapping(classElement, fkRelationships)}
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
    }`;
    }
  
    static generateSaveDataMapping(
      classElement: ClassElement,
      fkRelationships: RelationshipInfo[]
    ): string {
      const mappings: string[] = [];
      
      for (const attr of classElement.attributes) {
        if (attr.name === 'id') continue;
        const fieldName = this.toCamelCase(attr.name);
        const dartType = this.mapJavaToDartType(attr.type);
        
        if (dartType === 'int') {
          mappings.push(`      ${fieldName}: int.tryParse(${fieldName}Controller.text)`);
        } else if (dartType === 'double') {
          mappings.push(`      ${fieldName}: double.tryParse(${fieldName}Controller.text)`);
        } else {
          mappings.push(`      ${fieldName}: ${fieldName}Controller.text`);
        }
      }
      
      for (const rel of fkRelationships) {
        mappings.push(`      ${this.toCamelCase(rel.targetClass)}Id: selected${rel.targetClass}Id`);
      }
      
      return mappings.join(',\n');
    }
  
    private static generateNestedItemDialog(targetClass: string, targetElement: ClassElement): string {
      const controllers = targetElement.attributes
        .filter(attr => attr.name !== 'id')
        .map(attr => `final ${this.toCamelCase(attr.name)}Controller = TextEditingController();`)
        .join('\n    ');
      
      const disposeControllers = targetElement.attributes
        .filter(attr => attr.name !== 'id')
        .map(attr => `${this.toCamelCase(attr.name)}Controller.dispose();`)
        .join('\n      ');
      
      const fields = targetElement.attributes
        .filter(attr => attr.name !== 'id')
        .map(attr => {
          const fieldName = this.toCamelCase(attr.name);
          return `            TextFormField(
                controller: ${fieldName}Controller,
                decoration: InputDecoration(labelText: '${this.capitalize(fieldName)}'),
                validator: (value) {
                  if (value == null || value.isEmpty) return 'Required';
                  return null;
                },
              ),
              const SizedBox(height: 12),`;
        }).join('\n');
      
      const loadExisting = targetElement.attributes
        .filter(attr => attr.name !== 'id')
        .map(attr => {
          const fieldName = this.toCamelCase(attr.name);
          return `      ${fieldName}Controller.text = item.${fieldName}?.toString() ?? '';`;
        }).join('\n');
      
      const createObject = targetElement.attributes
        .filter(attr => attr.name !== 'id')
        .map(attr => {
          const fieldName = this.toCamelCase(attr.name);
          const dartType = this.mapJavaToDartType(attr.type);
          if (dartType === 'int') {
            return `          ${fieldName}: int.tryParse(${fieldName}Controller.text)`;
          } else if (dartType === 'double') {
            return `          ${fieldName}: double.tryParse(${fieldName}Controller.text)`;
          }
          return `          ${fieldName}: ${fieldName}Controller.text`;
        }).join(',\n');
      
      return `  Future<void> _show${targetClass}Dialog({${targetClass}? item, int? index}) async {
      ${controllers}
      
      if (item != null) {
  ${loadExisting}
      }
      
      final formKey = GlobalKey<FormState>();
      
      final result = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(item == null ? 'Add ${targetClass}' : 'Edit ${targetClass}'),
          content: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
  ${fields}
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                if (formKey.currentState!.validate()) {
                  Navigator.pop(context, true);
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      );
      
      if (result == true) {
        final newItem = ${targetClass}(
  ${createObject},
          );
        
        setState(() {
          if (index != null) {
            ${this.toCamelCase(targetClass)}List[index] = newItem;
          } else {
            ${this.toCamelCase(targetClass)}List.add(newItem);
          }
        });
      }
      
      ${disposeControllers}
    }`;
    }
  
    private static generateSimpleFormFields(classElement: ClassElement): string {
      return classElement.attributes
        .filter(attr => attr.name !== 'id')
        .map(attr => {
          const fieldName = this.toCamelCase(attr.name);
          return `                    TextFormField(
                        controller: ${fieldName}Controller,
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
                      ),
                      const SizedBox(height: 16),`;
        }).join('\n');
    }
  
    private static generateSimpleSaveMapping(classElement: ClassElement): string {
      return classElement.attributes
        .filter(attr => attr.name !== 'id')
        .map(attr => {
          const fieldName = this.toCamelCase(attr.name);
          const dartType = this.mapJavaToDartType(attr.type);
          
          if (dartType === 'int') {
            return `      ${fieldName}: int.tryParse(${fieldName}Controller.text)`;
          } else if (dartType === 'double') {
            return `      ${fieldName}: double.tryParse(${fieldName}Controller.text)`;
          }
          return `      ${fieldName}: ${fieldName}Controller.text`;
        }).join(',\n');
    }
  
    private static generateBasicImports(className: string): string {
      return `import '../models/${this.toSnakeCase(className)}.dart';\nimport '../services/${this.toSnakeCase(className)}_service.dart';`;
    }
  
    private static getDisplayField(classElement: ClassElement): string {
      const preferredFields = ['name', 'nombre', 'title', 'titulo', 'description', 'email'];
      
      for (const preferred of preferredFields) {
        const found = classElement.attributes.find(attr => 
          attr.name.toLowerCase() === preferred
        );
        if (found) return found.name;
      }
      
      const firstNonId = classElement.attributes.find(attr => attr.name !== 'id');
      return firstNonId ? firstNonId.name : 'id';
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
  }