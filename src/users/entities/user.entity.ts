import { Role } from "src/common/enums/role.enum";
import { Diagram } from "src/diagrams/entities/diagram.entity";
import { Column, DeleteDateColumn, Entity, ManyToMany, OneToMany } from "typeorm";

@Entity()
export class User {
  @Column({ primary: true, generated: true })
  id: number;

  @Column({ length: 500 })
  name: string;

  @Column({ unique: true, nullable: false })
  email: string;

  @Column({ nullable: false, select: false })
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: string;

  // Diagramas creados
  @OneToMany(() => Diagram, (diagram) => diagram.owner)
  ownedDiagrams: Diagram[];

  // Diagramas compartidos
  @ManyToMany(() => Diagram, (diagram) => diagram.sharedWith)
  sharedDiagrams: Diagram[];

  @DeleteDateColumn()
  deletedAt: Date;
}