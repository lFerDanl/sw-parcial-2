import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthModule } from './auth/auth.module';
import { DiagramGateway } from './diagrams/diagram.gateway';
import { DiagramsModule } from './diagrams/diagrams.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    UsersModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: true, // ⚠️ solo en desarrollo
        //----------
        ssl: process.env.POSTGRES_SSL === "true",
        extra: {
          ssl:
            process.env.POSTGRES_SSL === "true"
              ? {
                  rejectUnauthorized: false,
                }
              : null,
        },
      }),
    }),
    AuthModule,
    DiagramsModule,
  ],
  controllers: [],
  providers: [DiagramGateway],
})
export class AppModule {}
