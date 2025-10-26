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