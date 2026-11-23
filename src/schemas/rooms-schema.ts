import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const denied: RolePermissions = { read: false, create: false, update: false, delete: false }
const roomReader: RolePermissions = { ...denied, read: 'team' }
const ownReader: RolePermissions = { ...denied, read: 'own' }

// All writes are Worker-owned. Even app admins cannot bypass room membership.
export const roomsSchema: CollectionSchema = {
  name: 'decision_rooms',
  ownerField: 'creatorId',
  teamField: 'roomId',
  columns: [
    { name: 'roomId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 100 },
    { name: 'description', storage: 'text', interpretation: 'plain', maxLength: 600 },
    { name: 'creatorId', storage: 'text', interpretation: 'plain', required: true, immutable: true, userBound: true },
    { name: 'createdAt', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'category', storage: 'text', interpretation: { kind: 'select', options: ['Product', 'Engineering', 'Design', 'Team & culture', 'Other'] }, required: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['Open', 'Archived'] }, required: true },
  ],
  permissions: { '*': denied, viewer: roomReader, member: roomReader, admin: roomReader },
}

// This exact table/column contract is consumed by DeepSpace's 'team' policy.
export const roomMembersSchema: CollectionSchema = {
  name: 'team_members',
  ownerField: 'userId',
  uniqueOn: ['teamId', 'userId'],
  columns: [
    { name: 'teamId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true, userBound: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['active'] }, required: true },
    { name: 'joinedAt', storage: 'text', interpretation: 'plain', required: true, immutable: true },
  ],
  permissions: { '*': denied, viewer: ownReader, member: ownReader, admin: ownReader },
}

export const roomInvitesSchema: CollectionSchema = {
  name: 'room_invites',
  columns: [
    { name: 'roomId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'creatorId', storage: 'text', interpretation: 'plain', required: true, immutable: true, userBound: true },
    { name: 'expiresAt', storage: 'text', interpretation: 'plain', required: true, immutable: true },
  ],
  // Invite hashes and their metadata are accessible only to app Worker code.
  permissions: { '*': denied, viewer: denied, member: denied, admin: denied },
}
