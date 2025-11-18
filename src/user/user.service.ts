import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/entity/user.entity';
import { Cipher } from 'src/utils/cipher';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly cipher: Cipher
  ) {
   
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.userRepository.findOne({ where: { email } });
  }

  async createUser(name: string, role: string, email: string, password: string): Promise<User> {

    const resultCipher = await this.cipher.cryptCifrado(password);

    return this.userRepository.save({ name, role, email, password: resultCipher});
  }
}
