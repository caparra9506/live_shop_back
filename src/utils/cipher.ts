import { Injectable } from "@nestjs/common";
import { CryptAes } from "./crytp-aes";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class Cipher {
  constructor(
    private readonly cryptAes: CryptAes
  ) { }
  public async decryptCifrado(value: string) {
    return this.cryptAes.decryptData(
        value
    );;
  }


  public async cryptCifrado(value: string) {
    return this.cryptAes.encryptData(
        value
    );
  }

}
