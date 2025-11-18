import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptAes } from './crytp-aes';
import { Cipher } from './cipher';


@Module({
    // IMPORTANTE: aquí debes importar ConfigModule para que Nest sepa
    // cómo inyectar ConfigService a Cipher o CryptAes
    imports: [ConfigModule],
    providers: [Cipher, CryptAes],
    exports: [Cipher, CryptAes],
  })
  export class UtilsModule {}