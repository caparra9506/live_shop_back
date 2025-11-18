import { Column, Entity, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import { Department } from "./departament.entity";

@Entity('countries')
export class Country {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @OneToMany(() => Department, (departament) => departament.country)
  departments: Department[];
}
