import { Clock3, Instagram, MapPin } from 'lucide-react'
import WhatsAppIcon from './WhatsAppIcon'

type Props = { kitchen?: boolean }

const INSTAGRAM_URL='https://www.instagram.com/_zen___cafe?igsi=MXhrZmJjeWtkc2VpMQ=='
const WHATSAPP_URL='https://wa.me/94705175174'

export default function PremiumFooter({ kitchen = false }: Props) {
  return (
    <footer id="contact" data-zen-reveal className="zen-reveal zen-footer-premium zen-footer-ink zen-footer-hero-match relative overflow-hidden">
      <div className="zen-footer-brush-word" aria-hidden="true">ZEN</div>
      <div className="zen-footer-glow zen-footer-glow-one" aria-hidden="true"/>
      <div className="zen-footer-glow zen-footer-glow-two" aria-hidden="true"/>
      <div className="paper-noise pointer-events-none absolute inset-0 opacity-10" />

      <div className="relative z-10 mx-auto max-w-[1500px] px-5 py-11 sm:px-10 lg:px-12 lg:py-14">
        <div className="grid gap-9 border-b border-white/[.075] pb-9 lg:grid-cols-[1.35fr_.9fr] lg:items-start lg:gap-16">
          <div className="max-w-[560px]">
            <a href={kitchen ? '/zen-kitchen.html' : '/'} className="inline-flex items-center gap-4">
              <span className="grid h-[66px] w-[66px] place-items-center overflow-hidden rounded-full bg-[#f8f0e8] p-1 shadow-[0_14px_30px_rgba(0,0,0,.24)] ring-1 ring-white/10">
                <img src="/assets/zen-logo.png" alt="Zen Café" className="h-full w-full rounded-full object-contain" />
              </span>
              <span>
                <b className="zen-footer-brand block text-[28px] leading-none">{kitchen ? 'ZEN KITCHEN' : 'ZEN CAFE'}</b>
                <span className="mt-2 block text-[8px] font-bold uppercase tracking-[.18em] text-[#dfb798]">Jaffna · Sri Lanka</span>
              </span>
            </a>
            <p className="zen-footer-copy mt-5 max-w-[430px] text-[11px] leading-6">
              {kitchen ? 'Restaurant dishes and café favourites from Zen Kitchen.' : 'Food, calm spaces and memorable café moments in one clean Zen experience.'}
            </p>
            <div className="zen-footer-socials mt-5 flex flex-wrap items-center gap-2">
              <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="Instagram ZEN_CAFE" className="footer-icon footer-social-link"><Instagram size={15}/><span>ZEN_CAFE</span></a>
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="WhatsApp +94 70 517 5174" className="footer-icon footer-social-link"><WhatsAppIcon size={20}/><span>+94 70 517 5174</span></a>
            </div>
          </div>

          <div className="lg:justify-self-end lg:min-w-[320px]">
            <p className="footer-heading">Visit & Contact</p>
            <div className="mt-5 space-y-4">
              <div className="footer-detail"><MapPin size={16}/><div><b>Jaffna</b><span>Café location</span></div></div>
              <div className="footer-detail"><Clock3 size={16}/><div><b>9:00 AM — 12:00 AM</b><span>Open daily</span></div></div>
            </div>
          </div>
        </div>

        <div className="zen-footer-meta flex flex-col gap-2 pt-6 text-[9px] font-medium uppercase tracking-[.11em] sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Zen Café. All rights reserved.</span>
          <span>ZEN_CAFE · Jaffna</span>
        </div>
      </div>
    </footer>
  )
}
