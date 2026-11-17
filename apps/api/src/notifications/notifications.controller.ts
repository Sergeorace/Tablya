import {
  Controller, Get, Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';

/**
 * Notifications — JWT staff OU client (le service filtre par
 * utilisateurId / clientId du token ; un staff ne voit que les siennes).
 */
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  lister(@CurrentUser() user: AuthUser, @Query('non_lues') nonLues?: string) {
    const flag = nonLues === '1' || nonLues === 'true';
    if (user.clientId) {
      return this.notifications.listerPourClient(user.clientId, flag);
    }
    return this.notifications.listerPourUtilisateur(user.userId, flag);
  }

  @Post('notifications/lire-tout')
  lireTout(@CurrentUser() user: AuthUser) {
    return this.notifications.marquerToutesLues(
      user.clientId ? { clientId: user.clientId } : { utilisateurId: user.userId },
    );
  }

  @Post('notifications/:id/lire')
  lire(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.marquerLue(
      id,
      user.clientId ? { clientId: user.clientId } : { utilisateurId: user.userId },
    );
  }
}
