export type RoomOption = {
  roomId: string
  optionId: string
  authorId: string
  title: string
  description: string
  createdAt: string
}
export type OptionComment = {
  roomId: string
  optionId: string
  authorId: string
  message: string
  createdAt: string
}
export type RoomVote = {
  roomId: string
  optionId: string
  userId: string
  updatedAt: string
}

export function voteResults(options: RoomOption[], votes: RoomVote[]) {
  const counts = new Map(options.map(option => [option.optionId, 0]))
  for (const vote of votes) {
    if (counts.has(vote.optionId)) counts.set(vote.optionId, counts.get(vote.optionId)! + 1)
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
  return { total, options: options.map(option => {
    const count = counts.get(option.optionId) ?? 0
    return { optionId: option.optionId, count, percentage: total ? count / total * 100 : 0 }
  }) }
}
