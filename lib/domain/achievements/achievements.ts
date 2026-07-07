import type { DomainError } from '../core/errors';
import type { UserId } from '../core/ids';
import type { Result } from '../core/result';

export interface UserAchievements {
  readonly points: number;
}

export interface UserAchievementsRepository {
  load(userId: UserId): Promise<Result<UserAchievements | null, DomainError>>;
}
