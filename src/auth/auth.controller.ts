import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from './guard/auth.guard';
import { Request } from 'express';
import { Roles } from './decorator/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from './guard/roles.guard';
import { Auth } from './decorator/auth.decorators';
import { ActiveUser } from 'src/common/decorator/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

interface RequestWithUser extends Request {
    user: { email: string; role: string };
}

@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    

    @Post("register")
    register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @HttpCode(HttpStatus.OK)
    @Post("login")
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Get('profile')
    @Roles(Role.USER)
    @UseGuards(AuthGuard, RolesGuard)
    profile(@Req() req: RequestWithUser,){
      return req.user;
    }

    @Get('profile2')
    @Auth(Role.ADMIN)
    profile2(@Req() req: RequestWithUser,){
        return req.user;
    }
    @Get('profile3')
    @Auth(Role.ADMIN)
    profile3(@ActiveUser() user: ActiveUserInterface){
        return user;
    }
}
