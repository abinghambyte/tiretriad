import { useSearchParams } from 'react-router-dom'
import { PeopleDashboard } from '../components/people/PeopleDashboard'
import { ContactsPage } from './ContactsPage'
import { ModuleSubheader } from '../components/layout/ModuleSubheader.jsx'

export function PeoplePage() {
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'customers' ? 'customers' : 'crew'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ModuleSubheader
        title="People Systems"
        subtitle="Crew access and customer contacts"
        tabs={[
          {
            key: 'crew',
            label: 'Crew',
            to: '/people',
            active: tab === 'crew',
          },
          {
            key: 'customers',
            label: 'Customers',
            to: '/people?tab=customers',
            active: tab === 'customers',
          },
        ]}
      />

      {tab === 'crew' ? <PeopleDashboard omitPageChrome /> : <ContactsPage embedded />}
    </div>
  )
}
