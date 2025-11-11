// src/diagrams/generators/flutter-form-generator.ts

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
  
  /**
   * Genera la pantalla completa de gestión CRUD para una clase
   */
  static generateFormScreen(
    classElement: ClassElement,
    relationships: RelationshipInfo[],
    diagramContent: DiagramContent,
    classId: string
  ): string {
    const className = classElement.name;
    const imports = this.generateImports(className, relationships);
    
    return `import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
${imports}

class ${className}FormScreen extends StatefulWidget {
  const ${className}FormScreen({super.key});

  @override
  State<${className}FormScreen> createState() => _${className}FormScreenState();
}

class _${className}FormScreenState extends State<${className}FormScreen> {
  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final service = Provider.of<${className}Service>(context, listen: false);
${this.generateFKServiceLoads(relationships)}
      await service.fetchAll();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('${className} Management'),
        backgroundColor: Theme.of(context).primaryColor,
        foregroundColor: Colors.white,
        elevation: 2,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: Consumer<${className}Service>(
        builder: (context, service, _) {
          if (service.isLoading) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          if (service.error != null) {
            return Center(
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
                    service.error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 16, color: Colors.grey),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: _loadData,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Retry'),
                  ),
                ],
              ),
            );
          }

          if (service.items.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.inbox,
                    size: 80,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'No ${className} items yet',
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Tap the + button to create your first item',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: _loadData,
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: service.items.length,
              itemBuilder: (context, index) {
                final item = service.items[index];
                return _buildItemCard(context, item, service);
              },
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openFormDialog(context),
        icon: const Icon(Icons.add),
        label: const Text('Create ${className}'),
        backgroundColor: Theme.of(context).primaryColor,
        foregroundColor: Colors.white,
      ),
    );
  }

  Widget _buildItemCard(BuildContext context, ${className} item, ${className}Service service) {
    return Card(
      elevation: 2,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: InkWell(
        onTap: () => _openFormDialog(context, item: item),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      color: Theme.of(context).primaryColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Center(
                      child: Text(
                        '#\${item.${this.getIdField(classElement)}}',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).primaryColor,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
${this.generateCardDisplayFields(classElement)}
                      ],
                    ),
                  ),
                  PopupMenuButton(
                    icon: const Icon(Icons.more_vert),
                    itemBuilder: (context) => [
                      const PopupMenuItem(
                        value: 'edit',
                        child: Row(
                          children: [
                            Icon(Icons.edit, size: 20),
                            SizedBox(width: 12),
                            Text('Edit'),
                          ],
                        ),
                      ),
                      const PopupMenuItem(
                        value: 'delete',
                        child: Row(
                          children: [
                            Icon(Icons.delete, color: Colors.red, size: 20),
                            SizedBox(width: 12),
                            Text('Delete', style: TextStyle(color: Colors.red)),
                          ],
                        ),
                      ),
                    ],
                    onSelected: (value) {
                      if (value == 'edit') {
                        _openFormDialog(context, item: item);
                      } else if (value == 'delete') {
                        _confirmDelete(context, item, service);
                      }
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openFormDialog(BuildContext context, {${className}? item}) async {
    await showDialog(
      context: context,
      builder: (context) => _${className}FormDialog(item: item),
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    ${className} item,
    ${className}Service service,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning, color: Colors.orange),
            SizedBox(width: 12),
            Text('Confirm Delete'),
          ],
        ),
        content: const Text(
          'Are you sure you want to delete this item? This action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      final success = await service.delete(item.${this.getIdField(classElement)}!);
      
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              success ? 'Item deleted successfully' : 'Failed to delete item',
            ),
            backgroundColor: success ? Colors.green : Colors.red,
          ),
        );
      }
    }
  }
}

// ============================================
// DIALOG DE FORMULARIO
// ============================================

class _${className}FormDialog extends StatefulWidget {
  final ${className}? item;

  const _${className}FormDialog({this.item});

  @override
  State<_${className}FormDialog> createState() => _${className}FormDialogState();
}

class _${className}FormDialogState extends State<_${className}FormDialog> {
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;

${this.generateControllers(classElement)}
${this.generateFKDropdownStates(relationships)}

  @override
  void initState() {
    super.initState();
    if (widget.item != null) {
      _loadExistingData();
    }
  }

  @override
  void dispose() {
${this.generateDisposeControllers(classElement)}
    super.dispose();
  }

  void _loadExistingData() {
    final item = widget.item!;
${this.generateLoadExistingData(classElement, relationships)}
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 600),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Theme.of(context).primaryColor,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    widget.item == null ? Icons.add_circle : Icons.edit,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      widget.item == null ? 'Create ${className}' : 'Edit ${className}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            // Form
            Flexible(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(20),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
${this.generateFormFields(classElement, relationships, diagramContent)}
                          ],
                        ),
                      ),
                    ),
            ),
            // Actions
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(16),
                  bottomRight: Radius.circular(16),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: _isLoading ? null : () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton(
                    onPressed: _isLoading ? null : _save,
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 12,
                      ),
                    ),
                    child: Text(widget.item == null ? 'Create' : 'Update'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    final service = Provider.of<${className}Service>(context, listen: false);
    
    final data = ${className}(
${this.generateSaveDataMapping(classElement, relationships)}
    );

    bool success;
    if (widget.item == null) {
      success = await service.create(data);
    } else {
      success = await service.update(widget.item!.${this.getIdField(classElement)}!, data);
    }

    setState(() => _isLoading = false);

    if (mounted) {
      if (success) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.item == null 
              ? '${className} created successfully' 
              : '${className} updated successfully'),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(service.error ?? 'Failed to save'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
`;
  }

  // ============================================
  // MÉTODOS AUXILIARES
  // ============================================

  private static generateImports(
    className: string,
    relationships: RelationshipInfo[]
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
    
    return [...new Set(imports)].join('\n');
  }

  private static generateControllers(classElement: ClassElement): string {
    return classElement.attributes
      .filter(attr => attr.name !== 'id' && attr.name.toLowerCase() !== 'id')
      .map(attr => `  final ${this.toCamelCase(attr.name)}Controller = TextEditingController();`)
      .join('\n');
  }

  private static generateFKDropdownStates(relationships: RelationshipInfo[]): string {
    const fkRels = relationships.filter(r => 
      r.isOwner && (r.type === 'ManyToOne' || r.type === 'OneToOne')
    );
    
    return fkRels
      .map(rel => `  int? selected${rel.targetClass}Id;`)
      .join('\n');
  }

  private static generateDisposeControllers(classElement: ClassElement): string {
    return classElement.attributes
      .filter(attr => attr.name !== 'id' && attr.name.toLowerCase() !== 'id')
      .map(attr => `    ${this.toCamelCase(attr.name)}Controller.dispose();`)
      .join('\n');
  }

  private static generateLoadExistingData(
    classElement: ClassElement,
    relationships: RelationshipInfo[]
  ): string {
    const loads: string[] = [];
    
    for (const attr of classElement.attributes) {
      if (attr.name === 'id' || attr.name.toLowerCase() === 'id') continue;
      const fieldName = this.toCamelCase(attr.name);
      loads.push(`    ${fieldName}Controller.text = item.${fieldName}?.toString() ?? '';`);
    }
    
    const fkRels = relationships.filter(r => 
      r.isOwner && (r.type === 'ManyToOne' || r.type === 'OneToOne')
    );
    
    for (const rel of fkRels) {
      loads.push(`    selected${rel.targetClass}Id = item.${this.toCamelCase(rel.targetClass)}Id;`);
    }
    
    return loads.join('\n');
  }

  private static generateFormFields(
    classElement: ClassElement,
    relationships: RelationshipInfo[],
    diagramContent: DiagramContent
  ): string {
    const fields: string[] = [];
    
    // Campos normales
    for (const attr of classElement.attributes) {
      if (attr.name === 'id' || attr.name.toLowerCase() === 'id') continue;
      
      const fieldName = this.toCamelCase(attr.name);
      const dartType = this.mapJavaToDartType(attr.type);
      const humanizedName = this.capitalize(this.humanize(attr.name));
      
      let inputType = 'TextInputType.text';
      if (dartType === 'int' || dartType === 'double') {
        inputType = 'TextInputType.number';
      }
      
      fields.push(`                            TextFormField(
                              controller: ${fieldName}Controller,
                              decoration: InputDecoration(
                                labelText: '${humanizedName}',
                                prefixIcon: const Icon(Icons.edit),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              keyboardType: ${inputType},
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'Please enter ${this.humanize(attr.name)}';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),`);
    }
    
    // Campos FK (dropdowns)
    const fkRels = relationships.filter(r => 
      r.isOwner && (r.type === 'ManyToOne' || r.type === 'OneToOne')
    );
    
    for (const rel of fkRels) {
      const targetClass = rel.targetClass;
      const displayField = this.getDisplayField(diagramContent.elements[rel.targetClassId]);
      
      fields.push(`                            Consumer<${targetClass}Service>(
                              builder: (context, service, _) {
                                if (service.isLoading) {
                                  return const Center(
                                    child: Padding(
                                      padding: EdgeInsets.all(16),
                                      child: CircularProgressIndicator(),
                                    ),
                                  );
                                }
                                return DropdownButtonFormField<int>(
                                  value: selected${targetClass}Id,
                                  decoration: InputDecoration(
                                    labelText: 'Select ${targetClass}',
                                    prefixIcon: const Icon(Icons.link),
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                  items: service.items.map((item) {
                                    return DropdownMenuItem(
                                      value: item.${this.getIdField(diagramContent.elements[rel.targetClassId])},
                                      child: Text(item.${this.toCamelCase(displayField)}?.toString() ?? 'N/A'),
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

  private static generateFKServiceLoads(relationships: RelationshipInfo[]): string {
    const fkRels = relationships.filter(r => 
      r.isOwner && (r.type === 'ManyToOne' || r.type === 'OneToOne')
    );
    
    return fkRels
      .map(rel => `      await Provider.of<${rel.targetClass}Service>(context, listen: false).fetchAll();`)
      .join('\n');
  }

  private static generateSaveDataMapping(
    classElement: ClassElement,
    relationships: RelationshipInfo[]
  ): string {
    const mappings: string[] = [];
    
    for (const attr of classElement.attributes) {
      if (attr.name === 'id' || attr.name.toLowerCase() === 'id') continue;
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
    
    const fkRels = relationships.filter(r => 
      r.isOwner && (r.type === 'ManyToOne' || r.type === 'OneToOne')
    );
    
    for (const rel of fkRels) {
      mappings.push(`      ${this.toCamelCase(rel.targetClass)}Id: selected${rel.targetClass}Id`);
    }
    
    return mappings.join(',\n');
  }

  private static generateCardDisplayFields(classElement: ClassElement): string {
    const displayAttrs = classElement.attributes
      .filter(attr => attr.name !== 'id' && attr.name.toLowerCase() !== 'id')
      .slice(0, 3);
    
    return displayAttrs.map((attr, idx) => {
      const fieldName = this.toCamelCase(attr.name);
      const isFirst = idx === 0;
      const humanizedName = this.capitalize(this.humanize(attr.name));
      
      if (isFirst) {
        return `                        Text(
                          item.${fieldName}?.toString() ?? 'N/A',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.black87,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),`;
      } else {
        return `                        Text(
                          '${humanizedName}: \${item.${fieldName}?.toString() ?? 'N/A'}',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.normal,
                            color: Colors.grey.shade600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),`;
      }
    }).join('\n');
  }

  private static getDisplayField(classElement: ClassElement): string {
    const preferredFields = ['name', 'nombre', 'title', 'titulo', 'description', 'email', 'code'];
    
    for (const preferred of preferredFields) {
      const found = classElement.attributes.find(attr => 
        attr.name.toLowerCase() === preferred
      );
      if (found) return found.name;
    }
    
    const firstNonId = classElement.attributes.find(attr => 
      attr.name !== 'id' && attr.name.toLowerCase() !== 'id'
    );
    return firstNonId ? firstNonId.name : 'id';
  }

  private static getIdField(classElement: ClassElement): string {
    const idAttr = classElement.attributes.find(attr => 
      attr.name === 'id' || attr.name.toLowerCase() === 'id'
    );
    return idAttr ? this.toCamelCase(idAttr.name) : 'id';
  }

  // Utilidades de conversión de nombres
  private static toSnakeCase(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }

  private static toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  private static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private static humanize(str: string): string {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .toLowerCase();
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