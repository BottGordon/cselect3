import type { ReactNode } from 'react'

type ProductArtworkProps = {
  productId: number
  productName: string
  image?: string
  className?: string
}

function ProductArtwork({ productId, productName, image, className }: ProductArtworkProps) {
  let item: ReactNode

  if (image) {
    item = <image href={image} x="0" y="0" width="400" height="320" preserveAspectRatio="xMidYMid meet" />
  } else {
    switch (productId) {
      case 1:
        item = (
          <>
            <path d="M153 83h94l-10 24v135c0 13-10 23-23 23h-28c-13 0-23-10-23-23V107z" fill="#e87522" stroke="#27364b" strokeWidth="5" />
            <path d="M153 83h94l-7 18h-80z" fill="#28374c" />
            <path d="M176 80c0-14 10-23 24-23s24 9 24 23" fill="none" stroke="#27364b" strokeWidth="7" />
            <path d="M167 117h66v104c0 9-7 16-16 16h-34c-9 0-16-7-16-16z" fill="#f5822d" />
            <path d="M175 131v91M225 131v91" stroke="#cf5e17" strokeWidth="3" opacity=".65" />
            <path d="M178 153h44M178 203h44" stroke="#27364b" strokeWidth="4" />
            <circle cx="200" cy="179" r="17" fill="#26364b" />
            <path d="M194 164h12v9h9v12h-9v9h-12v-9h-9v-12h9z" fill="#f8fafc" />
          </>
        )
        break
      case 2:
        item = (
          <>
            <path d="M142 111c0-13 10-23 23-23h70c13 0 23 10 23 23v111c0 13-10 23-23 23h-70c-13 0-23-10-23-23z" fill="#d9433d" stroke="#26364b" strokeWidth="5" />
            <path d="M164 89V73c0-10 8-18 18-18h36c10 0 18 8 18 18v16" fill="none" stroke="#26364b" strokeWidth="10" />
            <path d="M151 125h98v80h-98z" fill="#e84d45" />
            <path d="M189 143h22v15h15v22h-15v15h-22v-15h-15v-22h15z" fill="#fff" />
            <path d="M151 120h14v91h-14M235 120h14v91h-14" fill="#c83532" />
            <path d="M157 104h11v9h-11M232 104h11v9h-11M157 218h11v9h-11M232 218h11v9h-11" fill="#f8c14a" stroke="#26364b" strokeWidth="2" />
          </>
        )
        break
      case 3:
        item = (
          <>
            <path d="M185 61h30l-3 18h-24z" fill="#26364b" />
            <rect x="181" y="77" width="38" height="159" rx="17" fill="#d9e2e8" stroke="#34465a" strokeWidth="5" />
            <rect x="187" y="86" width="26" height="141" rx="12" fill="#a9d0dd" />
            <path d="M190 92h20v12h-20z" fill="#536e80" />
            <path d="M187 120h26M187 127h26M187 200h26M187 207h26" stroke="#718897" strokeWidth="3" />
            <path d="M191 112v81M209 112v81" stroke="#edf5f7" strokeWidth="3" />
            <path d="M186 231h28" stroke="#26364b" strokeWidth="6" strokeLinecap="round" />
            <circle cx="200" cy="64" r="4" fill="#ff791d" />
          </>
        )
        break
      case 4:
        item = (
          <>
            <path d="M117 185 228 91l61 45-112 96z" fill="#c5cbd0" stroke="#526273" strokeWidth="4" />
            <path d="m133 187 96-79 43 32-97 79z" fill="#e4e7e9" stroke="#fff" strokeWidth="3" />
            <path d="m145 192 14 10 97-79-14-10zM157 203l14 10 97-79-14-10zM169 214l14 10 97-79-14-10z" fill="#c8ced3" />
            <path d="m122 185 50 36-1 12-59-43z" fill="#7e8a94" />
            <path d="m231 91 8-7 59 44-9 8z" fill="#f1f2f2" stroke="#526273" strokeWidth="3" />
            <path d="m117 185 110-94 62 45-112 96z" fill="none" stroke="#f4f5f5" strokeWidth="2" opacity=".8" />
          </>
        )
        break
      case 5:
        item = (
          <>
            <path d="M166 79c0-13 10-23 23-23h22c13 0 23 10 23 23v20l39 34-20 112c-2 10-10 17-20 17h-66c-10 0-18-7-20-17l-20-112 39-34z" fill="#f37924" stroke="#26364b" strokeWidth="5" />
            <path d="M174 91V76c0-8 6-14 14-14h20c8 0 14 6 14 14v15" fill="none" stroke="#27374b" strokeWidth="6" />
            <path d="m160 101 40 44 40-44M200 145v111" fill="none" stroke="#25374c" strokeWidth="6" />
            <path d="m149 139 18 16-12 34-17-6zM251 139l-18 16 12 34 17-6z" fill="#ffbd51" stroke="#27374b" strokeWidth="3" />
            <path d="M166 174h22v38h-22zM212 174h22v38h-22z" fill="#f5a23b" stroke="#27374b" strokeWidth="3" />
            <path d="M174 157h15M211 157h15" stroke="#fff2ce" strokeWidth="5" />
            <circle cx="200" cy="130" r="7" fill="#fff" />
          </>
        )
        break
      case 6:
        item = (
          <>
            <rect x="112" y="96" width="176" height="141" rx="21" fill="#ef7621" stroke="#26364b" strokeWidth="5" />
            <path d="M159 97V81c0-14 11-25 25-25h31c14 0 25 11 25 25v16" fill="none" stroke="#26364b" strokeWidth="9" />
            <rect x="133" y="117" width="72" height="58" rx="7" fill="#26394e" />
            <rect x="141" y="125" width="56" height="42" rx="3" fill="#9ec9c6" />
            <path d="M148 157h43M153 134h22M181 134h8" stroke="#314f60" strokeWidth="3" />
            <circle cx="242" cy="139" r="22" fill="#f6b33e" stroke="#26364b" strokeWidth="4" />
            <path d="M242 125v28M228 139h28" stroke="#26364b" strokeWidth="4" />
            <circle cx="225" cy="199" r="11" fill="#26364b" />
            <circle cx="259" cy="199" r="11" fill="#26364b" />
            <path d="M225 199h34M240 183l9-10 10 10" fill="none" stroke="#f7d079" strokeWidth="3" />
            <path d="M126 222h148" stroke="#c85b16" strokeWidth="4" />
            <circle cx="145" cy="194" r="4" fill="#fff" />
          </>
        )
        break
      case 7:
        item = (
          <>
            <path d="m160 84 40-20 40 20 27 43-24 13v91c0 9-7 16-16 16h-54c-9 0-16-7-16-16v-91l-24-13z" fill="#f4c927" stroke="#39485a" strokeWidth="5" />
            <path d="m160 84-23 43 20 11 27-40M240 84l23 43-20 11-27-40" fill="#e7b820" stroke="#39485a" strokeWidth="4" />
            <path d="M190 81c0-8 4-13 10-13s10 5 10 13v29h-20z" fill="#f7d544" stroke="#39485a" strokeWidth="3" />
            <path d="M200 109v119M178 133h44" stroke="#d5ae19" strokeWidth="4" />
            <path d="M171 166h58M171 202h58" stroke="#f9e88a" strokeWidth="5" />
            <path d="M179 231h42" stroke="#39485a" strokeWidth="5" strokeLinecap="round" />
          </>
        )
        break
      case 8:
      case 9:
        item = (
          <>
            <path d="M151 102V83c0-14 10-24 24-24h50c14 0 24 10 24 24v19l27 22v109c0 12-9 21-21 21h-110c-12 0-21-9-21-21V124z" fill="#536747" stroke="#26364b" strokeWidth="5" />
            <path d="M166 83c0-9 7-16 16-16h40c9 0 16 7 16 16" fill="none" stroke="#26364b" strokeWidth="7" />
            <path d="M151 103h98M146 126h108v102H146z" fill="#657950" stroke="#26364b" strokeWidth="4" />
            <path d="M165 144h70v58h-70z" fill="#485b3c" stroke="#2b3d35" strokeWidth="4" />
            <path d="M187 143v60M213 143v60" stroke="#283a35" strokeWidth="4" />
            <path d="M177 157h46v29h-46z" fill="#a44830" stroke="#26364b" strokeWidth="3" />
            <path d="M192 163h16v6h6v9h-6v6h-16v-6h-6v-9h6z" fill="#fff" />
            <path d="m151 115-22 18v69l22 9M249 115l22 18v69l-22 9" fill="none" stroke="#26364b" strokeWidth="7" />
            <path d="M159 104v25M241 104v25" stroke="#d2a953" strokeWidth="5" />
          </>
        )
        break
      default:
        item = <circle cx="200" cy="160" r="60" fill="#cbd5dc" />
    }
  }

  return (
    <svg
      className={className}
      viewBox="0 0 400 320"
      role="img"
      aria-label={`${productName} product illustration`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="400" height="320" fill="#eef1f4" />
      <ellipse cx="200" cy="266" rx="105" ry="13" fill="#cbd2d8" opacity=".58" />
      {item}
    </svg>
  )
}

export default ProductArtwork
