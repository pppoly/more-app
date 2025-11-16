import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, AppRole } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Unauthorized');
    }

    if (requiredRoles.includes('admin') && !user.isAdmin) {
      throw new ForbiddenException('Administrator privileges required');
    }

    if (requiredRoles.includes('organizer') && !user.isOrganizer) {
      throw new ForbiddenException({
        error: 'NOT_ORGANIZER',
        message: '現在のアカウントは主理人ではありません。主理人申請を行ってください。',
      });
    }

    return true;
  }
}
