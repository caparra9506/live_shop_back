import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    JoinColumn,
  } from 'typeorm';
  import { Country } from './country.entity';
  import { City } from './city.entity';
  
  @Entity('departments')
  export class Department {
    @PrimaryGeneratedColumn()
    id: number;
  
    @Column()
    name: string;
  
    @ManyToOne(() => Country, (country) => country.departments)
    @JoinColumn({ name: 'country_id' }) // Relacion con país
    country: Country;
  
    @OneToMany(() => City, (city) => city.department)
    cities: City[];
  }
  