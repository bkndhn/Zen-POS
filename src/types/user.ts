export type UserStatus = 'active' | 'paused' | 'deleted';
export type UserRole = 'super_admin' | 'admin' | 'user';

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  role: UserRole;
  hotel_name?: string;
  status: UserStatus;
  admin_id?: string; // For sub-users, links to their admin
}

export interface UserProfile extends Profile {
  created_at: string;
  updated_at: string;
}
