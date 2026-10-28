import type { LucideIcon } from 'lucide-react'

type Props = { title: string; value: number; subtitle: string; icon: LucideIcon; tone: 'rose' | 'amber' | 'green'; onClick: () => void }
export default function StatCard({ title, value, subtitle, icon: Icon, tone, onClick }: Props) {
  return <button className={`za-stat za-stat-${tone}`} onClick={onClick}>
    <span className="za-stat-icon"><Icon size={27}/></span>
    <span className="za-stat-copy"><small>{title}</small><strong>{value}</strong><span>{subtitle}</span></span>
    <span className="za-stat-arrow" aria-hidden="true">›</span>
  </button>
}
