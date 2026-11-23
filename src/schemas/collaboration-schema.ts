import type { CollectionSchema, ColumnDefinition, RolePermissions } from 'deepspace/schema'

const denied: RolePermissions = { read: false, create: false, update: false, delete: false }
const reader: RolePermissions = { ...denied, read: 'team' }
const roomColumn: ColumnDefinition = { name: 'roomId', storage: 'text', interpretation: 'plain', required: true, immutable: true }
const optionColumn: ColumnDefinition = { name: 'optionId', storage: 'text', interpretation: 'plain', required: true }
const authorColumn: ColumnDefinition = { name: 'authorId', storage: 'text', interpretation: 'plain', required: true, immutable: true, userBound: true }
const timestamp: ColumnDefinition = { name: 'createdAt', storage: 'text', interpretation: 'plain', required: true, immutable: true }
const permissions = { '*': denied, viewer: reader, member: reader, admin: reader }

export const optionsSchema: CollectionSchema = {
  name: 'room_options', teamField: 'roomId', permissions,
  columns: [roomColumn, { ...optionColumn, immutable: true }, authorColumn,
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 100 },
    { name: 'description', storage: 'text', interpretation: 'plain', maxLength: 600 }, timestamp],
}
export const commentsSchema: CollectionSchema = {
  name: 'option_comments', teamField: 'roomId', permissions,
  columns: [roomColumn, { ...optionColumn, immutable: true }, authorColumn,
    { name: 'message', storage: 'text', interpretation: 'plain', required: true, maxLength: 600 }, timestamp],
}
export const votesSchema: CollectionSchema = {
  name: 'room_votes', teamField: 'roomId', permissions, uniqueOn: ['roomId', 'userId'],
  columns: [roomColumn, optionColumn,
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true, userBound: true },
    { name: 'updatedAt', storage: 'text', interpretation: 'plain', required: true }],
}
