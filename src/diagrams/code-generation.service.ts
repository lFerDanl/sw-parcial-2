import { Injectable } from '@nestjs/common';
import * as JSZip from 'jszip';



@Injectable()
export class CodeGenerationService {
  
  /**
   * Genera un proyecto Spring Boot completo en formato ZIP
   */
  async generateSpringBootProject(
    content: DiagramContent,
    projectName: string = 'generated-project',
    basePackage: string = 'com.example.demo'
  ): Promise<Buffer> {
    const zip = new JSZip();
    
    // Guardar contenido actual para uso en otros métodos
    this.currentContent = content;
    
    // Construir mapa de IDs a nombres de clases
    this.buildClassIdMap(content.elements);
    
    // Estructura base del proyecto
    const srcMain = zip.folder(`${projectName}/src/main`)!;
    const srcMainJava = srcMain.folder('java')!;
    const srcMainResources = srcMain.folder('resources')!;
    
    // Crear estructura de paquetes
    const packagePath = basePackage.replace(/\./g, '/');
    const baseFolder = srcMainJava.folder(packagePath)!;
    
    const controllerFolder = baseFolder.folder('controller')!;
    const dtoFolder = baseFolder.folder('dto')!;
    const entityFolder = baseFolder.folder('entity')!;
    const repositoryFolder = baseFolder.folder('repository')!;
    const serviceFolder = baseFolder.folder('service')!;
    
    // Generar archivos para cada clase
    for (const [classId, classData] of Object.entries(content.elements)) {
      const className = classData.name;
      
      // 1. Entity
      entityFolder.file(
        `${className}.java`,
        this.generateEntity(className, classData, content.relations, basePackage)
      );
      
      // 2. DTO
      dtoFolder.file(
        `${className}DTO.java`,
        this.generateDTO(className, classData, basePackage)
      );
      
      // 3. Repository
      repositoryFolder.file(
        `${className}Repository.java`,
        this.generateRepository(className, basePackage)
      );
      
      // 4. Service
      serviceFolder.file(
        `${className}Service.java`,
        this.generateService(className, basePackage)
      );
      
      // 5. Controller
      controllerFolder.file(
        `${className}Controller.java`,
        this.generateController(className, basePackage)
      );
    }
    
    // Generar Application.java (main)
    baseFolder.file(
      'Application.java',
      this.generateMainApplication(basePackage, projectName)
    );
    
    // Generar application.properties
    srcMainResources.file(
      'application.properties',
      this.generateApplicationProperties(projectName)
    );
    
    // Generar pom.xml
    zip.file(
      `${projectName}/pom.xml`,
      this.generatePomXml(projectName, basePackage)
    );
    
    // Generar README.md
    zip.file(
      `${projectName}/README.md`,
      this.generateReadme(projectName)
    );
    
    // 🆕 Generar scripts de configuración
    zip.file(
      `${projectName}/setup.bat`,
      this.generateSetupBat(projectName, basePackage)
    );
    
    zip.file(
      `${projectName}/setup.sh`,
      this.generateSetupSh(projectName, basePackage)
    );
    
    // Archivo de configuración template
    zip.file(
      `${projectName}/database.config.template`,
      this.generateDatabaseConfigTemplate()
    );
    
    // 🆕 .gitignore
    zip.file(
      `${projectName}/.gitignore`,
      this.generateGitignore()
    );
    
    // 🆕 Scripts Maven Wrapper (para usuarios sin Maven instalado)
    const mvnFolder = zip.folder(`${projectName}/.mvn`)!;
    const wrapperFolder = mvnFolder.folder('wrapper')!;
    
    wrapperFolder.file(
      'maven-wrapper.properties',
      this.generateMavenWrapperProperties()
    );

    zip.file(
      `${projectName}/mvnw`,
      this.generateMavenWrapperScript()
    );
    
    zip.file(
      `${projectName}/mvnw.cmd`,
      this.generateMavenWrapperCmd()
    );
    
    // 🆕 Archivo de ayuda rápida
    zip.file(
      `${projectName}/QUICK_START.txt`,
      this.generateQuickStart(projectName)
    );
    
    return await zip.generateAsync({ type: 'nodebuffer' });
  }
  
  /**
   * Genera la clase Entity con todas las anotaciones JPA
   */
  private generateEntity(
    className: string,
    classData: ClassElement,
    relations: Record<string, Relation>,
    basePackage: string
  ): string {
    const imports = new Set<string>([
      'import jakarta.persistence.*;',
      'import lombok.Data;',
      'import lombok.NoArgsConstructor;',
      'import lombok.AllArgsConstructor;'
    ]);
    
    const attributes: string[] = [];
    const relationFields: string[] = [];

      // Variables para herencia
    let parentClass: string | null = null;
    let isInheritanceParent = false;

      // Buscar relaciones de herencia
    for (const relation of Object.values(relations)) {
        const fromClass = this.getClassNameById(relation.from, relations);
        const toClass = this.getClassNameById(relation.to, relations);

        if (relation.type === 'Inheritance') {
        if (fromClass === className) {
            // Esta clase es la PADRE
            isInheritanceParent = true;
        }
        if (toClass === className) {
            // Esta clase es HIJA → guarda referencia del padre
            parentClass = fromClass;
        }
        }
    }
    
    // Buscar el ID
    const idAttr = classData.attributes.find(attr => 
      attr.name.toLowerCase() === 'id'
    );
    
    // Agregar atributos básicos (solo si no es clase hija con herencia)
    if (!parentClass) {
        for (const attr of classData.attributes) {
        const javaType = this.mapTypeToJava(attr.type);

        if (attr.name.toLowerCase() === 'id') {
            attributes.push(`    @Id`);
            attributes.push(`    @GeneratedValue(strategy = GenerationType.IDENTITY)`);
        }

        attributes.push(`    private ${javaType} ${attr.name};`);
        }
    } else {
        // Si es hija, solo copia atributos distintos de ID
        for (const attr of classData.attributes) {
        if (attr.name.toLowerCase() === 'id') continue; // ID viene del padre
        const javaType = this.mapTypeToJava(attr.type);
        attributes.push(`    private ${javaType} ${attr.name};`);
        }
    }
    
    // Procesar relaciones (excepto Inheritance, ya manejada)
    for (const [relId, relation] of Object.entries(relations)) {
        if (relation.type === 'Inheritance') continue;

        const isSource = this.getClassNameById(relation.from, relations) === className;
        const isTarget = this.getClassNameById(relation.to, relations) === className;

        if (isSource) {
        const targetClass = this.getClassNameById(relation.to, relations);
        const relationField = this.generateRelationField(
            relation.type,
            targetClass,
            true,
            imports
        );
        relationFields.push(relationField);
        }

        if (isTarget && relation.type !== 'ManyToOne' && !isSource) {
        const sourceClass = this.getClassNameById(relation.from, relations);
        const inverseType = this.getInverseRelationType(relation.type);
        const relationField = this.generateRelationField(
            inverseType,
            sourceClass,
            false,
            imports
        );
        relationFields.push(relationField);
        }
    }
    const hasLists = relationFields.some(f => f.includes('List<'));
    const hasSets = relationFields.some(f => f.includes('Set<'));

    if (hasLists) {
      imports.add('import java.util.List;');
      imports.add('import java.util.ArrayList;');
    }

    if (hasSets) {
      imports.add('import java.util.Set;');
      imports.add('import java.util.HashSet;');
    }

      // Construir clase con herencia
    let inheritanceAnnotation = "";
    if (isInheritanceParent) {
        inheritanceAnnotation = `
@Inheritance(strategy = InheritanceType.JOINED)`;
    }

  const extendsClause = parentClass ? ` extends ${parentClass}` : "";
    
    // Construir el código de la clase
    return `package ${basePackage}.entity;

${Array.from(imports).join('\n')}
import java.util.*;

@Entity
@Table(name = "${this.toSnakeCase(className)}")${inheritanceAnnotation}
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ${className}${extendsClause} {

${attributes.join('\n')}

${relationFields.join('\n\n')}
}
`;
  }
  
  /**
   * Genera campos de relación con anotaciones JPA
   */
  private generateRelationField(
    relationType: string,
    targetClass: string,
    isOwner: boolean,
    imports: Set<string>
  ): string {
    const fieldName = this.toLowerCamelCase(targetClass);
    
    switch (relationType) {
      case 'OneToOne':
        if (isOwner) {
          return `    @OneToOne
    @JoinColumn(name = "${this.toSnakeCase(fieldName)}_id")
    private ${targetClass} ${fieldName};`;
        } else {
          return `    @OneToOne(mappedBy = "${fieldName}")
    private ${targetClass} ${fieldName};`;
        }
        
      case 'OneToMany':
        imports.add('import java.util.List;');
        return `    @OneToMany(mappedBy = "${this.toLowerCamelCase(targetClass)}", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<${targetClass}> ${fieldName}List = new ArrayList<>();`;
        
      case 'ManyToOne':
        return `    @ManyToOne
    @JoinColumn(name = "${this.toSnakeCase(fieldName)}_id")
    private ${targetClass} ${fieldName};`;
        
    case 'ManyToMany':
        imports.add('import java.util.Set;');
        if (isOwner) {
          // ✅ Ajuste: Generar nombre de tabla consistente alfabéticamente
          const sourceTable = this.toSnakeCase(targetClass);
          const targetTable = this.toSnakeCase(fieldName);
          const joinTableName = sourceTable < targetTable 
            ? `${sourceTable}_${targetTable}` 
            : `${targetTable}_${sourceTable}`;
          
          return `    @ManyToMany
    @JoinTable(
        name = "${joinTableName}",
        joinColumns = @JoinColumn(name = "${this.toSnakeCase(targetClass)}_id"),
        inverseJoinColumns = @JoinColumn(name = "${this.toSnakeCase(fieldName)}_id")
    )
    private Set<${targetClass}> ${fieldName}Set = new HashSet<>();`;
        } else {
          return `    @ManyToMany(mappedBy = "${fieldName}Set")
    private Set<${targetClass}> ${fieldName}Set = new HashSet<>();`;
        }
        
    case 'Inheritance':
        return `    // ⚠️ Relación de herencia con ${targetClass}, manejar con 'extends ${targetClass}'`;

    case 'Composition':
        imports.add('import java.util.List;');
        return `    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
    private List<${targetClass}> ${fieldName}List = new ArrayList<>();`;
    
    case 'Aggregation':
        imports.add('import java.util.List;');
        return `    @OneToMany
    private List<${targetClass}> ${fieldName}List = new ArrayList<>();`;
        
      default:
        return `    private ${targetClass} ${fieldName};`;
    }
  }
  
  /**
   * Genera la clase DTO
   */
  private generateDTO(
    className: string,
    classData: ClassElement,
    basePackage: string
  ): string {
    const attributes = classData.attributes
      .map(attr => {
        const javaType = this.mapTypeToJava(attr.type);
        return `    private ${javaType} ${attr.name};`;
      })
      .join('\n');
    
    // Generar getters y setters explícitos
    const gettersSetters = classData.attributes
      .map(attr => {
        const javaType = this.mapTypeToJava(attr.type);
        const capitalizedName = this.capitalize(attr.name);
        return `
    public ${javaType} get${capitalizedName}() {
        return ${attr.name};
    }

    public void set${capitalizedName}(${javaType} ${attr.name}) {
        this.${attr.name} = ${attr.name};
    }`;
      })
      .join('\n');
    
    return `package ${basePackage}.dto;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.io.Serializable;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ${className}DTO implements Serializable {

${attributes}
${gettersSetters}
}
`;
  }
  
  /**
   * Genera el Repository
   */
  private generateRepository(className: string, basePackage: string): string {
    return `package ${basePackage}.repository;

import ${basePackage}.entity.${className};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ${className}Repository extends JpaRepository<${className}, Long> {
}
`;
  }
  
  /**
   * Genera el Service con mapeo completo
   */
  private generateService(className: string, basePackage: string): string {
    const varName = this.toLowerCamelCase(className);
    
    // Obtener los atributos de esta clase
    const classData = Object.values(this.currentContent.elements).find(
      el => el.name === className
    );
    
    const attributes = classData?.attributes || [];
    
    // Generar mapeo DTO -> Entity
    const entityMapping = attributes
      .filter(attr => attr.name.toLowerCase() !== 'id')
      .map(attr => `        ${varName}.set${this.capitalize(attr.name)}(dto.get${this.capitalize(attr.name)}());`)
      .join('\n');
    
    // Generar mapeo Entity -> DTO
    const dtoMapping = attributes
      .map(attr => `        dto.set${this.capitalize(attr.name)}(${varName}.get${this.capitalize(attr.name)}());`)
      .join('\n');
    
    return `package ${basePackage}.service;

import ${basePackage}.entity.${className};
import ${basePackage}.dto.${className}DTO;
import ${basePackage}.repository.${className}Repository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class ${className}Service {

    @Autowired
    private ${className}Repository ${varName}Repository;

    public List<${className}DTO> findAll() {
        return ${varName}Repository.findAll().stream()
            .map(this::convertToDTO)
            .collect(Collectors.toList());
    }

    public Optional<${className}DTO> findById(Long id) {
        return ${varName}Repository.findById(id)
            .map(this::convertToDTO);
    }

    public ${className}DTO create(${className}DTO ${varName}DTO) {
        ${className} ${varName} = convertToEntity(${varName}DTO);
        ${className} saved = ${varName}Repository.save(${varName});
        return convertToDTO(saved);
    }

    public Optional<${className}DTO> update(Long id, ${className}DTO ${varName}DTO) {
        return ${varName}Repository.findById(id)
            .map(existing -> {
                updateEntityFromDTO(existing, ${varName}DTO);
                return convertToDTO(${varName}Repository.save(existing));
            });
    }

    public boolean delete(Long id) {
        if (${varName}Repository.existsById(id)) {
            ${varName}Repository.deleteById(id);
            return true;
        }
        return false;
    }

    private ${className}DTO convertToDTO(${className} ${varName}) {
        if (${varName} == null) return null;
        
        ${className}DTO dto = new ${className}DTO();
${dtoMapping}
        return dto;
    }

    private ${className} convertToEntity(${className}DTO dto) {
        if (dto == null) return null;
        
        ${className} ${varName} = new ${className}();
${entityMapping}
        return ${varName};
    }

    private void updateEntityFromDTO(${className} ${varName}, ${className}DTO dto) {
        if (dto == null) return;
        
${entityMapping}
    }
}
`;
  }
  
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  private currentContent: DiagramContent;
  
  /**
   * Genera el Controller
   */
  private generateController(className: string, basePackage: string): string {
    const varName = this.toLowerCamelCase(className);
    const endpoint = this.toKebabCase(className);
    
    return `package ${basePackage}.controller;

import ${basePackage}.dto.${className}DTO;
import ${basePackage}.service.${className}Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/${endpoint}")
@CrossOrigin(origins = "*")
public class ${className}Controller {

    @Autowired
    private ${className}Service ${varName}Service;

    @GetMapping
    public ResponseEntity<List<${className}DTO>> getAll() {
        return ResponseEntity.ok(${varName}Service.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<${className}DTO> getById(@PathVariable Long id) {
        return ${varName}Service.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<${className}DTO> create(@RequestBody ${className}DTO ${varName}DTO) {
        ${className}DTO created = ${varName}Service.create(${varName}DTO);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<${className}DTO> update(
        @PathVariable Long id,
        @RequestBody ${className}DTO ${varName}DTO
    ) {
        return ${varName}Service.update(id, ${varName}DTO)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (${varName}Service.delete(id)) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }
}
`;
  }
  
  /**
   * Genera la clase principal de Spring Boot
   */
  private generateMainApplication(basePackage: string, projectName: string): string {
    const className = this.toPascalCase(projectName.replace(/-/g, '_')) + 'Application';
    
    return `package ${basePackage};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
`;
  }
  
  /**
   * Genera application.properties
   */
  private generateApplicationProperties(projectName: string): string {
    const dbName = projectName.replace(/-/g, '_');
    
    return `# Server Configuration
server.port=8080

# Database Configuration
spring.datasource.url=jdbc:postgresql://localhost:5432/${dbName}
spring.datasource.username=postgres
spring.datasource.password=postgres
spring.datasource.driver-class-name=org.postgresql.Driver

# JPA Configuration
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect

# Logging
logging.level.org.hibernate.SQL=DEBUG
logging.level.org.hibernate.type.descriptor.sql.BasicBinder=TRACE
`;
  }
  
  /**
   * Genera pom.xml
   */
  private generatePomXml(projectName: string, basePackage: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>

    <groupId>${basePackage}</groupId>
    <artifactId>${projectName}</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>${projectName}</name>
    <description>Generated Spring Boot project</description>

    <properties>
        <java.version>17</java.version>
    </properties>

    <dependencies>
        <!-- Spring Boot Starter Web -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>

        <!-- Spring Boot Starter Data JPA -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>

        <!-- PostgreSQL Driver -->
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>

        <!-- Lombok -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>

        <!-- Spring Boot Starter Test -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>

        <!-- Spring Boot Starter Validation -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
`;
  }
  
/**
   * Genera README.md
   */
private generateReadme(projectName: string): string {
    const dbName = projectName.replace(/-/g, '_');
    
    return `# ${projectName}

> Proyecto Spring Boot generado automáticamente desde diagrama UML

## 🚀 Inicio Rápido

### Opción 1: Configuración Automática (Recomendado)

#### Windows:
\`\`\`cmd
setup.bat
\`\`\`

#### Linux/Mac:
\`\`\`bash
chmod +x setup.sh
./setup.sh
\`\`\`

Este script automáticamente:
- ✅ Verifica Java y Maven
- ✅ Crea la base de datos PostgreSQL
- ✅ Configura application.properties
- ✅ Instala todas las dependencias
- ✅ Compila el proyecto

### Opción 2: Manual

1. **Instalar PostgreSQL** (si no está instalado)
   - Windows: https://www.postgresql.org/download/windows/
   - Mac: \`brew install postgresql\`
   - Linux: \`sudo apt install postgresql\`

2. **Crear base de datos**:
   \`\`\`bash
   createdb ${dbName}
   \`\`\`

3. **Configurar credenciales** en \`src/main/resources/application.properties\`:
   \`\`\`properties
   spring.datasource.url=jdbc:postgresql://localhost:5432/${dbName}
   spring.datasource.username=tu_usuario
   spring.datasource.password=tu_contraseña
   \`\`\`

4. **Instalar dependencias**:
   \`\`\`bash
   mvn clean install
   \`\`\`

5. **Ejecutar el proyecto**:
   \`\`\`bash
   mvn spring-boot:run
   \`\`\`

---

## 📋 Requisitos

- **Java**: 17 o superior
- **Maven**: 3.8+ (o usar Maven Wrapper incluido)
- **PostgreSQL**: 14+ (o cambiar a otra BD en application.properties)

### Verificar requisitos:

\`\`\`bash
java -version
mvn -version
psql --version
\`\`\`

---

## 🏗️ Estructura del Proyecto

\`\`\`
${projectName}/
├── src/
│   └── main/
│       ├── java/
│       │   └── [paquete base]/
│       │       ├── Application.java          # Clase principal
│       │       ├── controller/               # REST Controllers
│       │       ├── dto/                      # Data Transfer Objects
│       │       ├── entity/                   # JPA Entities
│       │       ├── repository/               # Spring Data Repositories
│       │       └── service/                  # Business Logic
│       └── resources/
│           └── application.properties        # Configuración
├── pom.xml                                   # Maven dependencies
├── setup.bat                                 # Setup automático (Windows)
├── setup.sh                                  # Setup automático (Linux/Mac)
├── config-wizard.bat                         # Wizard configuración (Windows)
├── config-wizard.sh                          # Wizard configuración (Linux/Mac)
└── README.md                                 # Esta documentación
\`\`\`

---

## 🔌 API Endpoints

Todas las entidades tienen endpoints CRUD automáticos:

### Endpoints Disponibles:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET    | \`/api/{entity}\` | Listar todos |
| GET    | \`/api/{entity}/{id}\` | Obtener por ID |
| POST   | \`/api/{entity}\` | Crear nuevo |
| PUT    | \`/api/{entity}/{id}\` | Actualizar |
| DELETE | \`/api/{entity}/{id}\` | Eliminar |

**Ejemplo de uso:**

\`\`\`bash
# Listar todos los registros
curl http://localhost:8080/api/user

# Obtener registro por ID
curl http://localhost:8080/api/user/1

# Crear nuevo registro
curl -X POST http://localhost:8080/api/user \\
  -H "Content-Type: application/json" \\
  -d '{"username":"john","email":"john@example.com"}'

# Actualizar registro
curl -X PUT http://localhost:8080/api/user/1 \\
  -H "Content-Type: application/json" \\
  -d '{"username":"jane","email":"jane@example.com"}'

# Eliminar registro
curl -X DELETE http://localhost:8080/api/user/1
\`\`\`

---

## 🗄️ Base de Datos

### Conexión por defecto:

- **Host**: localhost
- **Puerto**: 5432
- **Base de datos**: ${dbName}
- **Usuario**: postgres
- **Contraseña**: postgres

### Cambiar a otra base de datos:

#### MySQL:
\`\`\`properties
spring.datasource.url=jdbc:mysql://localhost:3306/${dbName}
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQL8Dialect
\`\`\`

Agregar en pom.xml:
\`\`\`xml
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <scope>runtime</scope>
</dependency>
\`\`\`

#### H2 (Base de datos en memoria - para testing):
\`\`\`properties
spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driver-class-name=org.h2.Driver
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect
spring.h2.console.enabled=true
\`\`\`

---

## 🛠️ Comandos Útiles

### Desarrollo:

\`\`\`bash
# Ejecutar en modo desarrollo
mvn spring-boot:run

# Ejecutar con perfil específico
mvn spring-boot:run -Dspring-boot.run.profiles=dev

# Ejecutar tests
mvn test

# Compilar sin tests
mvn clean install -DskipTests
\`\`\`

### Producción:

\`\`\`bash
# Empaquetar aplicación
mvn clean package

# Ejecutar JAR
java -jar target/${projectName}-0.0.1-SNAPSHOT.jar

# Ejecutar con perfil de producción
java -jar target/${projectName}-0.0.1-SNAPSHOT.jar --spring.profiles.active=prod
\`\`\`

### Limpieza:

\`\`\`bash
# Limpiar compilaciones anteriores
mvn clean

# Limpiar base de datos (recrear tablas)
# Cambiar en application.properties:
# spring.jpa.hibernate.ddl-auto=create
\`\`\`

---

## 🐳 Docker (Opcional)

### Crear Dockerfile:

\`\`\`dockerfile
FROM eclipse-temurin:17-jdk-alpine
VOLUME /tmp
COPY target/${projectName}-0.0.1-SNAPSHOT.jar app.jar
ENTRYPOINT ["java","-jar","/app.jar"]
\`\`\`

### Crear docker-compose.yml:

\`\`\`yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: ${dbName}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/${dbName}
      SPRING_DATASOURCE_USERNAME: postgres
      SPRING_DATASOURCE_PASSWORD: postgres
    depends_on:
      - postgres

volumes:
  postgres_data:
\`\`\`

### Ejecutar con Docker:

\`\`\`bash
# Compilar
mvn clean package -DskipTests

# Construir imagen
docker build -t ${projectName} .

# Ejecutar con docker-compose
docker-compose up
\`\`\`

---

## 📝 Configuración Avanzada

### application.properties:

\`\`\`properties
# Puerto del servidor
server.port=8080

# Nivel de logs
logging.level.root=INFO
logging.level.com.example=DEBUG

# Pool de conexiones
spring.datasource.hikari.maximum-pool-size=10
spring.datasource.hikari.minimum-idle=5

# JPA avanzado
spring.jpa.hibernate.ddl-auto=update
spring.jpa.open-in-view=false
spring.jpa.properties.hibernate.jdbc.batch_size=20
spring.jpa.properties.hibernate.order_inserts=true
spring.jpa.properties.hibernate.order_updates=true

# CORS (si necesitas configurarlo)
# Agregar en controller con @CrossOrigin
\`\`\`

---

## 🔒 Seguridad (TODO)

Este proyecto NO incluye autenticación/autorización. Para agregarlo:

### Con Spring Security:

1. Agregar dependencia:
\`\`\`xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
\`\`\`

2. Crear configuración de seguridad
3. Implementar JWT o sesiones

---

## 📊 Monitoreo (Opcional)

### Actuator para métricas:

\`\`\`xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
\`\`\`

Endpoints de monitoreo:
- http://localhost:8080/actuator/health
- http://localhost:8080/actuator/metrics
- http://localhost:8080/actuator/info

---

## 🐛 Troubleshooting

### Error: "Port 8080 already in use"
\`\`\`bash
# Cambiar puerto en application.properties
server.port=8081
\`\`\`

### Error: "Connection refused to PostgreSQL"
- Verificar que PostgreSQL esté corriendo
- Verificar credenciales en application.properties
- Verificar firewall/puerto 5432

### Error: "Table doesn't exist"
\`\`\`properties
# En application.properties, cambiar a:
spring.jpa.hibernate.ddl-auto=create
# Luego volver a 'update'
\`\`\`

### Error: "Java version not compatible"
- Instalar Java 17+: https://adoptium.net/

### Error: "Maven command not found"
\`\`\`bash
# Usar Maven Wrapper incluido
./mvnw spring-boot:run  # Linux/Mac
mvnw.cmd spring-boot:run  # Windows
\`\`\`

---

## 📚 Recursos

- [Spring Boot Documentation](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Spring Data JPA](https://docs.spring.io/spring-data/jpa/docs/current/reference/html/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Maven Documentation](https://maven.apache.org/guides/)

---

## 📄 Licencia

Este proyecto fue generado automáticamente. Puedes usarlo y modificarlo libremente.

---

## 🤝 Soporte

Si encuentras problemas:

1. Revisa la sección de **Troubleshooting**
2. Verifica los logs en consola
3. Revisa la configuración de application.properties
4. Asegúrate de que todos los requisitos estén instalados

---

## 🎉 ¡Listo para usar!

Tu aplicación Spring Boot está lista. Solo ejecuta:

\`\`\`bash
# Windows
setup.bat

# Linux/Mac
./setup.sh
\`\`\`

Y comienza a desarrollar. ¡Feliz codificación! 🚀
`;
  }// src/diagrams/code-generation.service.ts
  
  // ========== Utilidades ==========
  
  private classIdToNameMap: Map<string, string> = new Map();
  
  private buildClassIdMap(elements: Record<string, ClassElement>): void {
    this.classIdToNameMap.clear();
    for (const [classId, classData] of Object.entries(elements)) {
      this.classIdToNameMap.set(classId, classData.name);
    }
  }
  
  private getClassNameById(classId: string, relations: Record<string, Relation>): string {
    return this.classIdToNameMap.get(classId) || classId;
  }
  
  private getInverseRelationType(relationType: string): string {
    const inverseMap: Record<string, string> = {
      'OneToMany': 'ManyToOne',
      'ManyToOne': 'OneToMany',
      'ManyToMany': 'ManyToMany',
      'OneToOne': 'OneToOne',
    };
    return inverseMap[relationType] || relationType;
  }
  
  private mapTypeToJava(type: string): string {
    const typeMap: Record<string, string> = {
      'String': 'String',
      'Integer': 'Integer',
      'Long': 'Long',
      'Double': 'Double',
      'Float': 'Float',
      'Boolean': 'Boolean',
      'Date': 'java.util.Date',
      'LocalDate': 'java.time.LocalDate',
      'LocalDateTime': 'java.time.LocalDateTime',
      'BigDecimal': 'java.math.BigDecimal',
    };
    if (!typeMap[type]) {
        console.warn(`⚠️ Tipo desconocido "${type}" en diagrama, usando String por defecto`);
    }
    return typeMap[type] || 'String';
  }
  
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
  }
  
  private toLowerCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }
  
  private toKebabCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).replace(/^-/, '');
  }
  
  private toPascalCase(str: string): string {
    return str.replace(/(^\w|_\w)/g, m => m.replace('_', '').toUpperCase());
  }
  
  // ========== 🆕 Scripts de Configuración ==========
  
  /**
   * Script de configuración para Windows (.bat)
   */
  private generateSetupBat(projectName: string, basePackage: string): string {
    const dbName = projectName.replace(/-/g, '_');
    
    return `@echo off
echo ========================================
echo     ${projectName.toUpperCase()} - SETUP
echo ========================================
echo.

REM Verificar Java
echo [1/5] Verificando Java...
java -version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Java no esta instalado o no esta en PATH
    echo Por favor instala Java 17 o superior desde https://adoptium.net/
    pause
    exit /b 1
)
echo ✓ Java encontrado

REM Verificar Maven
echo.
echo [2/5] Verificando Maven...
call mvn -version >nul 2>&1
if errorlevel 1 (
    echo ADVERTENCIA: Maven no encontrado. Usando Maven Wrapper...
    if not exist mvnw.cmd (
        echo ERROR: Maven Wrapper no disponible
        echo Por favor instala Maven desde https://maven.apache.org/
        pause
        exit /b 1
    )
    set MAVEN_CMD=mvnw.cmd
) else (
    echo ✓ Maven encontrado
    set MAVEN_CMD=mvn
)

REM Verificar PostgreSQL
echo.
echo [3/5] Verificando PostgreSQL...
psql --version >nul 2>&1
if errorlevel 1 (
    echo ADVERTENCIA: PostgreSQL no encontrado en PATH
    echo Si no tienes PostgreSQL instalado, por favor instala desde https://www.postgresql.org/download/
    echo Luego crea la base manualmente con el nombre: ${dbName}
) else (
    echo ✓ PostgreSQL encontrado
    echo.
    echo Recuerda crear la base de datos manualmente con el nombre:
    echo ${dbName}
    echo.
    REM Actualizar application.properties
    echo [4/5] Actualizando configuracion...
    powershell -Command "(Get-Content src\\main\\resources\\application.properties) -replace 'username=postgres', 'username=postgres' -replace 'password=postgres', 'password=postgres' | Set-Content src\\main\\resources\\application.properties"
    echo ✓ Configuracion revisada (no se creó base de datos)
)

REM Actualizar application.properties
echo.
echo [5/6] Actualizando configuracion de application.properties...
set /p DB_USER="Usuario PostgreSQL [postgres]: "
if "%DB_USER%"=="" set DB_USER=postgres

set /p DB_PASS="Contraseña PostgreSQL: "
if "%DB_PASS%"=="" set DB_PASS=postgres

powershell -Command "(Get-Content src\\\\main\\\\resources\\\\application.properties) -replace 'username=.*', 'username=%DB_USER%' -replace 'password=.*', 'password=%DB_PASS%' | Set-Content src\\\\main\\\\resources\\\\application.properties"

echo ✓ Configuracion de application.properties actualizada

REM Instalar dependencias
echo.
echo [6/6] Instalando dependencias Maven...
call %MAVEN_CMD% clean install -DskipTests
if errorlevel 1 (
    echo ERROR: Fallo la instalacion de dependencias
    pause
    exit /b 1
)

echo.
echo ========================================
echo     SETUP COMPLETADO EXITOSAMENTE
echo ========================================
echo.
echo Para ejecutar el proyecto:
echo   1. %MAVEN_CMD% spring-boot:run
echo   2. O ejecuta: java -jar target\\${projectName}-0.0.1-SNAPSHOT.jar
echo.
echo La API estara disponible en: http://localhost:8080
echo.
pause
`;
  }
  
  /**
   * Script de configuración para Linux/Mac (.sh)
   */
  private generateSetupSh(projectName: string, basePackage: string): string {
    const dbName = projectName.replace(/-/g, '_');
    
    return `#!/bin/bash

echo "========================================"
echo "    ${projectName.toUpperCase()} - SETUP"
echo "========================================"
echo ""

# Verificar Java
echo "[1/5] Verificando Java..."
if ! command -v java &> /dev/null; then
    echo "❌ ERROR: Java no está instalado"
    echo "Por favor instala Java 17 o superior desde https://adoptium.net/"
    exit 1
fi
echo "✓ Java encontrado: $(java -version 2>&1 | head -n 1)"

# Verificar Maven
echo ""
echo "[2/5] Verificando Maven..."
if ! command -v mvn &> /dev/null; then
    echo "⚠️  ADVERTENCIA: Maven no encontrado. Usando Maven Wrapper..."
    if [ ! -f "./mvnw" ]; then
        echo "❌ ERROR: Maven Wrapper no disponible"
        echo "Por favor instala Maven desde https://maven.apache.org/"
        exit 1
    fi
    MAVEN_CMD="./mvnw"
else
    echo "✓ Maven encontrado: $(mvn -version | head -n 1)"
    MAVEN_CMD="mvn"
fi

# Verificar PostgreSQL
echo ""
echo "[3/5] Verificando PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo "⚠️  ADVERTENCIA: PostgreSQL no encontrado"
    echo "Si PostgreSQL está instalado, agrégalo al PATH"
    echo "O ejecuta manualmente: createdb ${dbName}"
    read -p "¿Continuar sin crear la base de datos? (s/n): " SKIP_DB
    if [ "$SKIP_DB" != "s" ] && [ "$SKIP_DB" != "S" ]; then
        echo "Setup cancelado"
        exit 1
    fi
else
    echo "✓ PostgreSQL encontrado: $(psql --version)"
    
    # Crear base de datos
    echo ""
    echo "[4/5] Creando base de datos..."
    read -p "Usuario PostgreSQL [postgres]: " DB_USER
    DB_USER=\${DB_USER:-postgres}
    
    read -sp "Contraseña PostgreSQL: " DB_PASS
    echo ""
    DB_PASS=\${DB_PASS:-postgres}
    
    export PGPASSWORD="$DB_PASS"
    psql -U "$DB_USER" -h localhost -c "DROP DATABASE IF EXISTS ${dbName};" 2>/dev/null
    psql -U "$DB_USER" -h localhost -c "CREATE DATABASE ${dbName};" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✓ Base de datos '${dbName}' creada exitosamente"
        
        # Actualizar application.properties
        echo ""
        echo "Actualizando configuración..."
        sed -i.bak "s/username=postgres/username=$DB_USER/g" src/main/resources/application.properties
        sed -i.bak "s/password=postgres/password=$DB_PASS/g" src/main/resources/application.properties
        rm -f src/main/resources/application.properties.bak
        echo "✓ Configuración actualizada"
    else
        echo "⚠️  ADVERTENCIA: No se pudo crear la base de datos automáticamente"
        echo "Por favor créala manualmente: createdb ${dbName}"
    fi
    unset PGPASSWORD
fi

# Instalar dependencias
echo ""
echo "[5/5] Instalando dependencias Maven..."
$MAVEN_CMD clean install -DskipTests

if [ $? -ne 0 ]; then
    echo "❌ ERROR: Falló la instalación de dependencias"
    exit 1
fi

echo ""
echo "========================================"
echo "    SETUP COMPLETADO EXITOSAMENTE"
echo "========================================"
echo ""
echo "Para ejecutar el proyecto:"
echo "  1. $MAVEN_CMD spring-boot:run"
echo "  2. O ejecuta: java -jar target/${projectName}-0.0.1-SNAPSHOT.jar"
echo ""
echo "La API estará disponible en: http://localhost:8080"
echo ""
`;
  }
  
  /**
   * Template de configuración de base de datos
   */
  private generateDatabaseConfigTemplate(): string {
    return `# ===================================================
# PLANTILLA DE CONFIGURACIÓN DE BASE DE DATOS
# ===================================================
# 
# Renombra este archivo a 'database.config' y completa
# los valores según tu entorno.
#
# IMPORTANTE: No subas este archivo a git con credenciales reales

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mi_base_de_datos
DB_USER=postgres
DB_PASSWORD=postgres

# Servidor
SERVER_PORT=8080

# Ambiente (development, production)
ENVIRONMENT=development

# ===================================================
# INSTRUCCIONES
# ===================================================
#
# 1. Copia este archivo: cp database.config.template database.config
# 2. Edita database.config con tus credenciales
# 3. Ejecuta config-wizard.bat (Windows) o ./config-wizard.sh (Linux/Mac)
# 4. O edita manualmente src/main/resources/application.properties
#
`;
  }
  
  /**
   * Genera .gitignore
   */
  private generateGitignore(): string {
    return `# Compiled class file
*.class

# Log file
*.log

# BlueJ files
*.ctxt

# Mobile Tools for Java (J2ME)
.mtj.tmp/

# Package Files
*.jar
*.war
*.nar
*.ear
*.zip
*.tar.gz
*.rar

# Virtual machine crash logs
hs_err_pid*

# Maven
target/
pom.xml.tag
pom.xml.releaseBackup
pom.xml.versionsBackup
pom.xml.next
release.properties
dependency-reduced-pom.xml
buildNumber.properties
.mvn/timing.properties
.mvn/wrapper/maven-wrapper.jar

# Eclipse
.classpath
.project
.settings/

# IntelliJ IDEA
.idea/
*.iws
*.iml
*.ipr
out/

# NetBeans
/nbproject/private/
/nbbuild/
/dist/
/nbdist/
/.nb-gradle/

# VS Code
.vscode/

# macOS
.DS_Store

# Windows
Thumbs.db
ehthumbs.db

# Application specific
database.config
application-local.properties

# Logs
logs/
*.log
`;
  }
  
  /**
   * Genera Maven Wrapper script para Linux/Mac
   */
  private generateMavenWrapperScript(): string {
    return `#!/bin/sh
# Maven Wrapper script

MAVEN_PROJECTBASEDIR=\${MAVEN_BASEDIR:-"\$PWD"}
MAVEN_OPTS="\${MAVEN_OPTS:--Xmx512m}"

exec mvn "$@"
`;
  }
  
  /**
   * Genera Maven Wrapper script para Windows
   */
  private generateMavenWrapperCmd(): string {
    return `<# : batch portion
  
  @IF "%__MVNW_ARG0_NAME__%"=="" (SET __MVNW_ARG0_NAME__=%~nx0)
  @SET __MVNW_CMD__=
  @SET __MVNW_ERROR__=
  @SET __MVNW_PSMODULEP_SAVE=%PSModulePath%
  @SET PSModulePath=
  @FOR /F "usebackq tokens=1* delims==" %%A IN (\`powershell -noprofile "& {$scriptDir='%~dp0'; $script='%__MVNW_ARG0_NAME__%'; icm -ScriptBlock ([Scriptblock]::Create((Get-Content -Raw '%~f0'))) -NoNewScope}"\`) DO @(
    IF "%%A"=="MVN_CMD" (set __MVNW_CMD__=%%B) ELSE IF "%%B"=="" (echo %%A) ELSE (echo %%A=%%B)
  )
  @SET PSModulePath=%__MVNW_PSMODULEP_SAVE%
  @SET __MVNW_PSMODULEP_SAVE=
  @SET __MVNW_ARG0_NAME__=
  @SET MVNW_USERNAME=
  @SET MVNW_PASSWORD=
  @IF NOT "%__MVNW_CMD__%"=="" (%__MVNW_CMD__% %*)
  @echo Cannot start maven from wrapper >&2 && exit /b 1
  @GOTO :EOF
  : end batch / begin powershell #>
  
  $ErrorActionPreference = "Stop"
  if ($env:MVNW_VERBOSE -eq "true") {
    $VerbosePreference = "Continue"
  }
  
  # calculate distributionUrl, requires .mvn/wrapper/maven-wrapper.properties
  $distributionUrl = (Get-Content -Raw "$scriptDir/.mvn/wrapper/maven-wrapper.properties" | ConvertFrom-StringData).distributionUrl
  if (!$distributionUrl) {
    Write-Error "cannot read distributionUrl property in $scriptDir/.mvn/wrapper/maven-wrapper.properties"
  }
  
  switch -wildcard -casesensitive ( $($distributionUrl -replace '^.*/','') ) {
    "maven-mvnd-*" {
      $USE_MVND = $true
      $distributionUrl = $distributionUrl -replace '-bin\\.[^.]*$',"-windows-amd64.zip"
      $MVN_CMD = "mvnd.cmd"
      break
    }
    default {
      $USE_MVND = $false
      $MVN_CMD = $script -replace '^mvnw','mvn'
      break
    }
  }
  
  if ($env:MVNW_REPOURL) {
    $MVNW_REPO_PATTERN = if ($USE_MVND) { "/org/apache/maven/" } else { "/maven/mvnd/" }
    $distributionUrl = "$env:MVNW_REPOURL$MVNW_REPO_PATTERN$($distributionUrl -replace '^.*'+$MVNW_REPO_PATTERN,'')"
  }
  $distributionUrlName = $distributionUrl -replace '^.*/',''
  $distributionUrlNameMain = $distributionUrlName -replace '\\.[^.]*$','' -replace '-bin$',''
  $MAVEN_HOME_PARENT = "$HOME/.m2/wrapper/dists/$distributionUrlNameMain"
  $MAVEN_HOME_NAME = ([System.Security.Cryptography.MD5]::Create().ComputeHash([byte[]][char[]]$distributionUrl) | ForEach-Object {$_.ToString("x2")}) -join ''
  $MAVEN_HOME = "$MAVEN_HOME_PARENT/$MAVEN_HOME_NAME"
  
  if (Test-Path -Path "$MAVEN_HOME" -PathType Container) {
    Write-Verbose "found existing MAVEN_HOME at $MAVEN_HOME"
    Write-Output "MVN_CMD=$MAVEN_HOME/bin/$MVN_CMD"
    exit $?
  }
  
  if (! $distributionUrlNameMain -or ($distributionUrlName -eq $distributionUrlNameMain)) {
    Write-Error "distributionUrl is not valid, must end with *-bin.zip, but found $distributionUrl"
  }
  
  # prepare tmp dir
  $TMP_DOWNLOAD_DIR_HOLDER = New-TemporaryFile
  $TMP_DOWNLOAD_DIR = New-Item -Itemtype Directory -Path "$TMP_DOWNLOAD_DIR_HOLDER.dir"
  $TMP_DOWNLOAD_DIR_HOLDER.Delete() | Out-Null
  trap {
    if ($TMP_DOWNLOAD_DIR.Exists) {
      try { Remove-Item $TMP_DOWNLOAD_DIR -Recurse -Force | Out-Null }
      catch { Write-Warning "Cannot remove $TMP_DOWNLOAD_DIR" }
    }
  }
  
  New-Item -Itemtype Directory -Path "$MAVEN_HOME_PARENT" -Force | Out-Null
  
  # Download and Install Apache Maven
  Write-Verbose "Couldn't find MAVEN_HOME, downloading and installing it ..."
  Write-Verbose "Downloading from: $distributionUrl"
  Write-Verbose "Downloading to: $TMP_DOWNLOAD_DIR/$distributionUrlName"
  
  $webclient = New-Object System.Net.WebClient
  if ($env:MVNW_USERNAME -and $env:MVNW_PASSWORD) {
    $webclient.Credentials = New-Object System.Net.NetworkCredential($env:MVNW_USERNAME, $env:MVNW_PASSWORD)
  }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $webclient.DownloadFile($distributionUrl, "$TMP_DOWNLOAD_DIR/$distributionUrlName") | Out-Null
  
  # If specified, validate the SHA-256 sum of the Maven distribution zip file
  $distributionSha256Sum = (Get-Content -Raw "$scriptDir/.mvn/wrapper/maven-wrapper.properties" | ConvertFrom-StringData).distributionSha256Sum
  if ($distributionSha256Sum) {
    if ($USE_MVND) {
      Write-Error "Checksum validation is not supported for maven-mvnd. \`nPlease disable validation by removing 'distributionSha256Sum' from your maven-wrapper.properties."
    }
    Import-Module $PSHOME\\Modules\\Microsoft.PowerShell.Utility -Function Get-FileHash
    if ((Get-FileHash "$TMP_DOWNLOAD_DIR/$distributionUrlName" -Algorithm SHA256).Hash.ToLower() -ne $distributionSha256Sum) {
      Write-Error "Error: Failed to validate Maven distribution SHA-256, your Maven distribution might be compromised. If you updated your Maven version, you need to update the specified distributionSha256Sum property."
    }
  }
  
  Expand-Archive "$TMP_DOWNLOAD_DIR/$distributionUrlName" -DestinationPath "$TMP_DOWNLOAD_DIR" | Out-Null
  Rename-Item -Path "$TMP_DOWNLOAD_DIR/$distributionUrlNameMain" -NewName $MAVEN_HOME_NAME | Out-Null
  try {
    Move-Item -Path "$TMP_DOWNLOAD_DIR/$MAVEN_HOME_NAME" -Destination $MAVEN_HOME_PARENT | Out-Null
  } catch {
    if (! (Test-Path -Path "$MAVEN_HOME" -PathType Container)) {
      Write-Error "fail to move MAVEN_HOME"
    }
  } finally {
    try { Remove-Item $TMP_DOWNLOAD_DIR -Recurse -Force | Out-Null }
    catch { Write-Warning "Cannot remove $TMP_DOWNLOAD_DIR" }
  }
  
  Write-Output "MVN_CMD=$MAVEN_HOME/bin/$MVN_CMD"
  `;
  }
  
  

  /**
 * Genera maven-wrapper.properties
 */
 private generateMavenWrapperProperties(): string {
    return `wrapperVersion=3.3.1
distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.6/apache-maven-3.9.6-bin.zip
`;
  }
  
  /**
   * Genera guía rápida de inicio
   */
  private generateQuickStart(projectName: string): string {
    const dbName = projectName.replace(/-/g, '_');
    
    return `
================================================================================
  ${projectName.toUpperCase()} - GUÍA DE INICIO RÁPIDO
================================================================================

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  🚀 OPCIÓN 1: INICIO AUTOMÁTICO (RECOMENDADO)                              │
│                                                                             │
│  Windows:                                                                   │
│    1. Doble clic en: setup.bat                                             │
│                                                                             │
│  Linux/Mac:                                                                 │
│    1. Abrir terminal en esta carpeta                                       │
│    2. chmod +x setup.sh                                                    │
│    3. ./setup.sh                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  🔧 OPCIÓN 2: CONFIGURACIÓN MANUAL                                         │
│                                                                             │
│  1. Instalar PostgreSQL (si no está instalado)                            │
│  2. Crear base de datos:                                                   │
│     createdb ${dbName}                                                     │
│                                                                             │
│  3. Editar: src/main/resources/application.properties                     │
│     - Cambiar usuario y contraseña de PostgreSQL                          │
│                                                                             │
│  4. Instalar dependencias:                                                 │
│     mvn clean install                                                      │
│                                                                             │
│  5. Ejecutar proyecto:                                                     │
│     mvn spring-boot:run                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

================================================================================
  REQUISITOS MÍNIMOS
================================================================================

  ✓ Java 17 o superior         → https://adoptium.net/
  ✓ Maven 3.8+ (opcional)      → Incluido Maven Wrapper
  ✓ PostgreSQL 14+             → https://www.postgresql.org/

  Verificar instalación:
    java -version
    mvn -version     (o usar ./mvnw)
    psql --version

================================================================================
  DESPUÉS DE LA INSTALACIÓN
================================================================================

  La aplicación estará disponible en:
  
  🌐 http://localhost:8080
  
  Endpoints de ejemplo:
    GET    http://localhost:8080/api/{entity}
    POST   http://localhost:8080/api/{entity}
    GET    http://localhost:8080/api/{entity}/1
    PUT    http://localhost:8080/api/{entity}/1
    DELETE http://localhost:8080/api/{entity}/1

================================================================================
  SOLUCIÓN DE PROBLEMAS
================================================================================

  ❌ "Port 8080 already in use"
     → Cambiar puerto en application.properties: server.port=8081

  ❌ "Connection refused to PostgreSQL"
     → Verificar que PostgreSQL esté corriendo
     → Verificar credenciales en application.properties

  ❌ "Java version not compatible"
     → Instalar Java 17+: https://adoptium.net/

  ❌ "Maven command not found"
     → Usar Maven Wrapper: ./mvnw spring-boot:run

================================================================================
  MÁS INFORMACIÓN
================================================================================

  📖 README completo: README.md
  🔧 Configuración avanzada: src/main/resources/application.properties
  📚 Documentación Spring Boot: https://spring.io/projects/spring-boot

================================================================================

¿Listo? Ejecuta setup.bat (Windows) o ./setup.sh (Linux/Mac) para comenzar! 🚀

`;
  }
}