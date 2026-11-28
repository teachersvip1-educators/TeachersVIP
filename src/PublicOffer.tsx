import { ArrowSquareOut, MapPin } from "@phosphor-icons/react"
import { Link } from "react-router-dom"
import type { PublicOffer } from "./public-offers"

function PublicOfferArtwork({ offer, detail = false }: { offer: PublicOffer; detail?: boolean }) {
  return (
    <div className={detail ? "deal-detail-media" : "deal-image public-offer-image"}>
      <span className="public-offer-banner">Public Offer</span>
      <img
        src={`/public-offers/${offer.id}.jpg`}
        alt=""
        width={1280}
        height={720}
        loading={detail ? "eager" : "lazy"}
      />
    </div>
  )
}

export default function PublicOfferCard({ offer }: { offer: PublicOffer }) {
  return (
    <article className="deal-card">
      <Link to={`/deals/public-${offer.id}`}>
        <PublicOfferArtwork offer={offer} />
        <div className="deal-copy">
          <small>{offer.category}</small>
          <h2>{offer.businessName}</h2>
          <strong>{offer.title}</strong>
          <p>{offer.details}</p>
          <div className="deal-meta">
            <span><MapPin size={15} weight="fill" aria-hidden="true" /> {offer.location}</span>
          </div>
        </div>
      </Link>
    </article>
  )
}

export function PublicOfferDetails({ offer }: { offer: PublicOffer }) {
  return (
    <section className="deal-detail">
      <PublicOfferArtwork offer={offer} detail />
      <div className="detail-copy">
        <h2>{offer.title}</h2>
        <p className="business-address">{offer.location}</p>
        <p>{offer.details}</p>
        <p>Redeem directly with the offer provider.</p>
        <div className="flow-actions">
          <a className="action action-navy" href={offer.providerUrl} target="_blank" rel="noreferrer">
            {offer.providerLabel ?? "View provider offer details"} <ArrowSquareOut size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  )
}
