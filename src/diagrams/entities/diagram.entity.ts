// src/diagrams/entities/diagram.entity.ts
import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity()
export class Diagram {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  // Guardamos el diagrama en JSON
  @Column({ type: 'jsonb', nullable: false, default: {} })
  content: Record<string, any>;

  // Usuario propietario
  @ManyToOne(() => User, (user) => user.ownedDiagrams, { onDelete: 'CASCADE' })
  owner: User;

  // Usuarios con los que se comparte el diagrama
  @ManyToMany(() => User, (user) => user.sharedDiagrams)
  @JoinTable()
  sharedWith: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
