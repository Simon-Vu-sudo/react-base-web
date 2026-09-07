import { createRoot } from 'react-dom/client'
import './index.css'

const el = document.getElementById('root')
if (!el) throw new Error('#root not found')
createRoot(el).render(<div className="p-4">React Base</div>)
