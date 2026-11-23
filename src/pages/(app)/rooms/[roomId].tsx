import { useParams } from 'react-router-dom'
import { RoomAccess } from '../../../components/decision-room/RoomAccess'
import { RoomDetail } from '../../../components/decision-room/RoomDetail'

export default function RoomPage() {
  const { roomId = '' } = useParams()
  return <RoomAccess><RoomDetail key={roomId} roomId={roomId} /></RoomAccess>
}
