export const roomCategories = ['Product', 'Engineering', 'Design', 'Team & culture', 'Other'] as const
export type RoomCategory = typeof roomCategories[number]
export type RoomStatus = 'Open' | 'Archived'

export type DecisionRoom = {
  roomId: string
  title: string
  description: string
  creatorId: string
  createdAt: string
  category: RoomCategory
  status: RoomStatus
}

export type RoomMember = {
  teamId: string
  userId: string
  status: 'active'
  joinedAt: string
}

export type RoomInvite = {
  roomId: string
  creatorId: string
  expiresAt: string
}

export type RoomInput = Pick<DecisionRoom, 'title' | 'description' | 'category'>
