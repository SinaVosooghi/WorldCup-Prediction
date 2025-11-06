import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Admin Guard
 *
 * Simple guard to protect admin-only endpoints.
 * In production, this should check user roles from the database.
 *
 * TODO: Implement proper role-based access control (RBAC)
 * - Add 'role' field to User entity (admin, user, etc.)
 * - Check user.role === 'admin' here
 * - Add role management endpoints
 *
 * For now, this is a placeholder that allows all authenticated users
 * but logs a warning to remind about implementing proper RBAC.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // TODO: Check if user has admin role
    // if (user.role !== 'admin') {
    //   throw new ForbiddenException('Admin access required');
    // }

    console.warn(
      '⚠️  AdminGuard: RBAC not fully implemented. All authenticated users have admin access. ' +
        'Implement role checking before production deployment.',
    );

    return true;
  }
}
