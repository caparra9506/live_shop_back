import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AuthPayloadDto } from './dto/auth.dto';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { Cipher } from 'src/utils/cipher';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private userService: UserService,
    private readonly cipher: Cipher,
  ) {}


  async signIn(username: string, password: string) {
    const findUser = await this.userService.findByEmail(username);
    if (!findUser) return null;
    const resultCipher = await this.cipher.decryptCifrado(findUser.password);
    if (password === resultCipher) {
      const { password, ...user } = findUser;
      return this.jwtService.sign(user);
    }
  }


  async validateUser({ username, password }: AuthPayloadDto) {
    const findUser = await this.userService.findByEmail(username);
    //const findUser = fakeUsers.find((user) => user.username === username);
    //const payload = { username: findUser.email, sub: findUser.id };
    // return this.jwtService.sign(payload);

    if (!findUser) return null;
    const resultCipher = await this.cipher.decryptCifrado(findUser.password);
    if (password === resultCipher) {
      const { password, ...user } = findUser;
      return this.jwtService.sign(user);
    }
  }
}
