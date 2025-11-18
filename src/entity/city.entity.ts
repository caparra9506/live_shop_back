import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Country } from './country.entity';
import { Store } from './store.entity';
import { TikTokUser } from './user-tiktok.entity';
import { Department } from './departament.entity';

@Entity('cities')
export class City {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  code: string;

  @OneToMany(() => Store, (store) => store.city)
  stores: Store[];

  @OneToMany(() => TikTokUser, (user) => user.city)
  tiktokUsers: TikTokUser[];

  @ManyToOne(() => Department, (department) => department.cities)
  @JoinColumn({ name: 'department_id' }) // Relacion con departamento
  department: Department;
}
