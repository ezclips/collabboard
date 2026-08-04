export type CardModalRoute = 'editor' | 'viewer';

export function selectCardModalRoute(canEditWorkspace: boolean): CardModalRoute {
  return canEditWorkspace ? 'editor' : 'viewer';
}
