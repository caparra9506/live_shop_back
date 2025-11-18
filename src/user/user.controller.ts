import { Controller, Post, Body } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('create')
  async create(@Body() body: { name: string, role: string, email: string; password: string }) {
    return this.userService.createUser(body.name, body.role, body.email, body.password);
  }
}
