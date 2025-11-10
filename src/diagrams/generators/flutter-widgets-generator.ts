// src/diagrams/generators/flutter-widgets-generator.ts

export class FlutterWidgetsGenerator {
  
    static generateCustomDropdown(): string {
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
        dropdownColor: Colors.white,
        elevation: 8,
      );
    }
  }
  `;
    }
  
    static generateNestedListWidget(): string {
      return `import 'package:flutter/material.dart';
  
  class NestedListWidget<T> extends StatelessWidget {
    final String title;
    final List<T> items;
    final VoidCallback onAdd;
    final Function(T item, int index) onEdit;
    final Function(int index) onDelete;
    final String Function(T item) itemBuilder;
  
    const NestedListWidget({
      super.key,
      required this.title,
      required this.items,
      required this.onAdd,
      required this.onEdit,
      required this.onDelete,
      required this.itemBuilder,
    });
  
    @override
    Widget build(BuildContext context) {
      return Card(
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.add_circle, color: Colors.blue),
                    onPressed: onAdd,
                    tooltip: 'Add Item',
                  ),
                ],
              ),
              const Divider(),
              if (items.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: Text(
                      'No items yet. Tap + to add.',
                      style: TextStyle(
                        color: Colors.grey,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                )
              else
                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final item = items[index];
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      leading: CircleAvatar(
                        backgroundColor: Colors.blue.shade100,
                        child: Text(
                          '\${index + 1}',
                          style: const TextStyle(
                            color: Colors.blue,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      title: Text(
                        itemBuilder(item),
                        style: const TextStyle(fontSize: 14),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.edit, size: 20),
                            onPressed: () => onEdit(item, index),
                            color: Colors.orange,
                            tooltip: 'Edit',
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete, size: 20),
                            onPressed: () => _confirmDelete(context, index),
                            color: Colors.red,
                            tooltip: 'Delete',
                          ),
                        ],
                      ),
                    );
                  },
                ),
            ],
          ),
        ),
      );
    }
  
    void _confirmDelete(BuildContext context, int index) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Confirm Delete'),
          content: const Text('Are you sure you want to delete this item?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                onDelete(index);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
              ),
              child: const Text('Delete'),
            ),
          ],
        ),
      );
    }
  }
  `;
    }
  
    static generateLoadingWidget(): string {
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
                style: const TextStyle(
                  fontSize: 16,
                  color: Colors.grey,
                ),
              ),
            ],
          ],
        ),
      );
    }
  }
  `;
    }
  
    static generateErrorWidget(): string {
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
                style: const TextStyle(
                  fontSize: 16,
                  color: Colors.grey,
                ),
              ),
              if (onRetry != null) ...[
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retry'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 12,
                    ),
                  ),
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
  
    static generateEmptyStateWidget(): string {
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
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 14,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
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