'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import { Button } from '@heroui/react'
import NavBar from './NavBar'
import Footer from './Footer'
import SourcesModal, { type SourceDocument } from './SourcesModal'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faFileLines, faCalendarDays, faUpRightFromSquare, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'

// Quote data from Figma
const quotes: SourceDocument[] = [
  {
    text: "We must address climate change as the existential threat of our time. The science is clear, and we cannot afford to delay action any longer.",
    author: "Emmanuel Macron",
    initials: "EM",
    source: "UN Climate Summit Speech",
    date: "November 15, 2023",
    articleTitle: "Macron Delivers Landmark Address at UN Climate Summit",
    articleAuthor: "Claire Deschamps",
    fullArticle: `DUBAI — French President Emmanuel Macron took center stage at the United Nations Climate Change Conference on Wednesday, delivering what many observers are calling the most forceful appeal for climate action from a world leader in years.

Speaking to a packed auditorium of delegates, heads of state, and climate activists from around the globe, Macron opened his address with a stark warning: "We must address climate change as the existential threat of our time. The science is clear, and we cannot afford to delay action any longer."

The speech, which lasted nearly forty-five minutes, laid out a comprehensive vision for global climate governance that the Élysée Palace has been developing for months. At its core was a call for a binding international framework that would commit industrialized nations to net-zero emissions by 2040 — a full decade ahead of the targets set by the Paris Agreement.

"We have spent too many years debating whether we should act," Macron told the assembly. "The glaciers are not waiting for our consensus. The oceans are not waiting for our reports. The forests are not waiting for our committees. Nature is moving, and we must move faster."

The French president outlined a three-pillar strategy that France would champion in the coming years. The first pillar focuses on what he called a "green industrial revolution," requiring massive public and private investment in renewable energy infrastructure across Europe and the developing world.

The second pillar addresses climate justice, acknowledging that the nations least responsible for emissions are often bearing the heaviest costs. Macron announced a €2 billion commitment from France to the Loss and Damage Fund, a significant increase from previous pledges and one that drew immediate applause from delegations representing small island nations.

The third pillar centers on scientific cooperation, with Macron proposing an international climate research consortium that would pool data, resources, and talent across borders. "Science brought us the understanding of this crisis," he said. "Science will bring us the solutions — but only if we tear down the walls between our laboratories and our nations."

Reaction to the speech was swift and largely positive, though not without its critics. German Chancellor Olaf Scholz praised the "ambition and clarity" of Macron's proposals, while UN Secretary-General António Guterres called it "a much-needed injection of urgency into our collective efforts."

However, some environmental groups expressed skepticism. Greenpeace International noted that France continues to rely heavily on nuclear energy and questioned whether Macron's domestic policies align with his international rhetoric. "Fine words on the global stage must be matched by fine actions at home," said a spokesperson.

Industry representatives also offered a mixed reception. The European Round Table for Industry acknowledged the need for climate action but warned that the accelerated timeline could pose challenges for manufacturing sectors still recovering from recent economic disruptions.

Analysts noted the speech represented a deliberate attempt by Macron to reassert France's leadership on climate issues, a role that had been somewhat overshadowed in recent years by domestic political challenges and the broader geopolitical turbulence affecting Europe.

The summit continues through the end of the week, with negotiations on the final communiqué expected to intensify as nations work toward a consensus on emission targets, financing mechanisms, and accountability frameworks.

Macron is scheduled to hold bilateral meetings with several key leaders over the coming days, including the heads of state of Brazil, India, and South Africa — nations considered pivotal in any meaningful global climate agreement.

As delegates filed out of the auditorium, the mood was cautiously optimistic. Whether Macron's ambitious proposals survive the grueling process of international negotiation remains to be seen, but for one afternoon at least, the case for urgent action had been made with uncommon force and conviction.`,
  },
  {
    text: "International cooperation on environmental policy is not just a choice, it's a necessity for our planet's survival.",
    author: "Emmanuel Macron",
    initials: "EM",
    source: "European Parliament Address",
    date: "September 8, 2023",
    articleTitle: "Macron Urges EU Unity on Environmental Policy in Strasbourg Address",
    articleAuthor: "Hans Mueller",
    fullArticle: `STRASBOURG — In a sweeping address to the European Parliament on Friday, French President Emmanuel Macron made an impassioned case for deeper European integration on environmental policy, arguing that the continent's future prosperity depends on its ability to act as a unified force against climate change.

"International cooperation on environmental policy is not just a choice, it's a necessity for our planet's survival," Macron declared to the assembled members of parliament, setting the tone for an address that ranged across topics from carbon markets to biodiversity to the geopolitics of green energy.

The speech came at a critical juncture for European environmental legislation. The European Green Deal, the flagship policy initiative aimed at making Europe climate-neutral by 2050, has faced mounting resistance from some member states concerned about the economic costs of rapid decarbonization.

Macron acknowledged these concerns head-on. "I understand the fears of those who worry about their livelihoods, their industries, their communities," he said. "But I tell you this — the greatest threat to European prosperity is not the cost of the green transition. It is the cost of failing to make it."

The French president presented new data compiled by French government economists suggesting that every euro invested in green infrastructure generates €2.40 in long-term economic returns through job creation, reduced healthcare costs, and lower energy prices. He used this analysis to argue that environmental policy should be understood not as a burden but as an investment.

A significant portion of the speech focused on the need for a common European approach to carbon border adjustment. The Carbon Border Adjustment Mechanism (CBAM), which began its transitional phase earlier this year, imposes a carbon price on imports from countries with less stringent climate regulations. Macron urged his fellow leaders to strengthen and expand the mechanism.

"We cannot allow European industries that play by the rules to be undercut by competitors who externalize their environmental costs," he argued. "A level playing field for climate responsibility is not protectionism — it is fairness."

Macron also devoted considerable attention to the question of biodiversity, an issue that has received less public attention than carbon emissions but which scientists increasingly identify as equally critical. He announced that France would be hosting a major international conference on biodiversity in Lyon next spring, and called on all EU member states to participate at the highest level.

The president's remarks on nuclear energy — a perennial point of contention in European energy debates — were notably diplomatic. While reaffirming France's commitment to nuclear power as a low-carbon energy source, he acknowledged that "each nation must find its own path" to clean energy and called for "mutual respect" among EU members on the question.

Reaction in the parliament chamber was divided along predictable lines. Members from the Greens/European Free Alliance gave Macron a standing ovation, while some representatives from the European Conservatives and Reformists group remained seated, later expressing concerns about the pace of regulatory change.

European Commission President praised Macron's vision, saying in a post-speech statement that "President Macron has reminded us why Europe leads the world on climate — not because it is easy, but because it is right."

Outside the parliament building, a small but vocal group of environmental protesters gathered to demand even more ambitious targets. Their signs read "Words are not enough" and "Act Now, Not 2050" — a reminder that even the most forward-leaning political leaders face pressure from a public increasingly anxious about the pace of change.

Macron concluded his address with a historical reference, comparing the current environmental challenge to the post-war reconstruction of Europe. "Our grandparents built this union from the rubble of conflict," he said. "We must now rebuild our relationship with the natural world from the rubble of decades of neglect. It is a task worthy of this institution, and worthy of this continent."

The speech is expected to set the agenda for upcoming European Council discussions on environmental policy, with several member states already signaling their willingness to engage with the proposals Macron outlined.`,
  },
  {
    text: "France will continue to lead by example in implementing green technologies and sustainable practices across all sectors.",
    author: "Emmanuel Macron",
    initials: "EM",
    source: "Paris Economic Forum",
    date: "June 22, 2023",
    articleTitle: "At Paris Economic Forum, Macron Unveils Green Industrial Strategy",
    articleAuthor: "Sophie Laurent",
    fullArticle: `PARIS — President Emmanuel Macron used the annual Paris Economic Forum on Thursday to unveil an ambitious new industrial strategy centered on green technology, declaring that France intends to become the world's leading exporter of clean energy solutions within the next decade.

"France will continue to lead by example in implementing green technologies and sustainable practices across all sectors," the president told an audience of business leaders, investors, and policymakers gathered at the Palais de Tokyo. "But leadership by example is not enough. We must also lead by innovation, by investment, and by imagination."

The strategy, which the government is calling "France Verte 2035," comprises a series of measures designed to accelerate the country's green transition while maintaining economic competitiveness. At its heart is a €30 billion public investment fund, supplemented by tax incentives aimed at attracting private capital to clean technology ventures.

The plan identifies five priority sectors: hydrogen production, advanced battery technology, offshore wind energy, sustainable agriculture, and green building materials. For each sector, the government has set specific targets for domestic production capacity, export volume, and job creation.

"We are not simply asking French industry to become greener," Macron explained. "We are asking it to become the greenest — and the most profitable. These two goals are not in conflict. In the 21st century, they are the same goal."

The announcement was met with enthusiasm from many in the business community. Bernard Arnault, chairman of LVMH, described the plan as "visionary and pragmatic in equal measure," while the chief executive of TotalEnergies, Patrick Pouyanné, called it "a clear signal that France is serious about its energy future."

A key component of the strategy is a new public-private partnership model that the government calls "Green Pacts." Under this framework, companies that commit to specific environmental targets — such as reducing emissions by a certain percentage or achieving zero-waste manufacturing — will receive preferential access to government contracts, reduced regulatory burdens, and direct subsidies for research and development.

The president also announced the creation of a new governmental body, the National Council for Green Innovation, which will bring together scientists, entrepreneurs, union representatives, and civil servants to coordinate the country's green industrial policy. The council will be chaired by a yet-to-be-announced figure from the private sector.

Education featured prominently in the speech as well. Macron outlined plans to create 50,000 new training positions in green technology fields over the next three years, working in partnership with universities, grandes écoles, and vocational training centers. "The green transition will create millions of jobs," he said. "But only if we prepare our workforce to fill them."

Not all reactions were positive, however. Union leaders from traditional industrial sectors expressed concern that the rapid pivot toward green technology could leave workers in legacy industries behind. Laurent Berger, the head of the CFDT trade union, acknowledged the importance of the green transition but warned against "a two-speed economy where some workers benefit and others are forgotten."

Environmental organizations offered cautious praise. WWF France described the plan as "a step in the right direction" but noted that it does not include explicit commitments to phase out fossil fuel subsidies, which the organization considers essential to any credible climate strategy.

International observers noted the competitive dimension of the announcement. The strategy comes at a time when the United States, China, and other major economies are all investing heavily in green technology. The Inflation Reduction Act in the US and China's massive investments in solar and battery manufacturing have raised concerns in Europe about falling behind in what some are calling the "green race."

Macron addressed this directly. "France and Europe will not be spectators in the global green economy," he said. "We have the talent, the technology, and the tradition of excellence to compete with anyone. What we need now is the will — and I am here to tell you that the will is there."

The Paris Economic Forum continues through Friday, with sessions planned on topics including digital transformation, global trade, and the future of work. But it was Macron's green industrial strategy that dominated the conversation in the corridors and cafés surrounding the venue, a sign that environmental economics has moved squarely to the center of France's policy debate.

Analysts expect the plan to face significant scrutiny in the National Assembly, where opposition parties are likely to challenge both its cost and its feasibility. Nevertheless, with public opinion polls showing strong support for climate action among French voters, the political terrain appears favorable for a bold environmental agenda.`,
  },
  {
    text: "Global affairs require multilateral solutions. No nation can tackle these challenges alone.",
    author: "Emmanuel Macron",
    initials: "EM",
    source: "G7 Summit Press Conference",
    date: "May 3, 2023",
    articleTitle: "Macron Champions Multilateralism at G7 as Global Tensions Rise",
    articleAuthor: "James Whitfield",
    fullArticle: `HIROSHIMA — Against the backdrop of a world grappling with war in Europe, rising tensions in the Indo-Pacific, and an escalating climate emergency, French President Emmanuel Macron used a press conference at the G7 summit on Wednesday to deliver a vigorous defense of multilateralism as the only viable approach to the challenges of the 21st century.

"Global affairs require multilateral solutions. No nation can tackle these challenges alone," Macron told reporters in the media center of the Hiroshima summit venue, his voice carrying the weight of a leader who has made international cooperation the defining theme of his presidency.

The remarks came after a day of intensive discussions among the leaders of the world's seven largest advanced economies — the United States, the United Kingdom, France, Germany, Italy, Japan, and Canada. The agenda covered a sweeping range of topics, from economic security and supply chain resilience to nuclear nonproliferation and artificial intelligence governance.

Macron expressed satisfaction with the day's discussions but was careful to frame them in the broader context of what he sees as a global trend toward fragmentation and unilateralism. "There are voices today that tell us to retreat behind our borders, to look inward, to pursue narrow national interests," he said. "These voices are wrong. They are not just morally wrong — they are strategically wrong."

The French president outlined what he called a "new multilateralism" — one that is "faster, more flexible, and more inclusive" than the international institutions built in the aftermath of World War II. He acknowledged that organizations like the United Nations, the World Trade Organization, and the International Monetary Fund need reform to remain effective in a rapidly changing world.

"Multilateralism does not mean clinging to institutions as they were designed seventy years ago," Macron said. "It means having the courage to reform them so they can meet the challenges of today and tomorrow. If we fail to reform, we risk irrelevance — and irrelevance is the greatest threat to the multilateral order."

On the subject of Russia's ongoing war in Ukraine, Macron reiterated France's unwavering support for Kyiv and called for continued unity among Western nations. "The defense of Ukraine is the defense of the principles on which our international order rests," he said. "Sovereignty, territorial integrity, the rule of law — these are not abstract concepts. They are the foundations of peace."

The president also addressed the growing geopolitical competition between the West and China, adopting a nuanced tone that distinguished France's position from the more confrontational rhetoric heard from some other G7 members. "China is a partner, a competitor, and a systemic rival," he said, reprising a formulation he has used before. "Our approach must be one of engagement without naivety."

Macron made a particular case for bringing emerging economies more fully into global governance structures. He renewed his call for reform of the UN Security Council, including the addition of permanent seats for African nations, and argued that the G7 format itself should be expanded or supplemented to include the voices of the Global South.

"We cannot credibly claim to address global challenges if the majority of the world's population has no seat at the table," he said. "The legitimacy of our institutions depends on their representativeness."

On climate change, Macron pressed his G7 counterparts to accelerate their commitments to phasing out fossil fuels and increasing climate finance for developing countries. He expressed frustration with what he characterized as the gap between "the urgency of the science" and "the pace of the politics."

"Every climate report tells us we are running out of time," he said. "Yet every summit, we spend days debating language and timelines. We must close this gap between knowledge and action — and the G7 has a special responsibility to lead."

The press conference also touched on the emerging challenge of artificial intelligence governance, with Macron calling for an international framework to manage the risks and opportunities of AI. France has been particularly active on this issue, hosting a major AI safety summit in Paris earlier in the year.

"Artificial intelligence will transform every aspect of our societies," Macron said. "We cannot allow this transformation to happen without democratic oversight, ethical guardrails, and international cooperation. The technology moves fast — our governance must move faster."

Journalists pressed Macron on whether multilateral institutions are capable of responding to crises with sufficient speed, given the often-slow pace of diplomatic negotiations. The president acknowledged the challenge but argued that the alternative — unilateral action — is ultimately more costly and less effective.

"Yes, multilateralism is difficult. Yes, it is slow. Yes, it requires compromise," he said. "But the cost of failure is not just diplomatic inconvenience. It is war, it is famine, it is climate catastrophe. Against those stakes, patience and perseverance are not weaknesses — they are strengths."

The G7 summit continues through Thursday, with a final communiqué expected to address the full range of issues discussed. Macron is scheduled to hold additional bilateral meetings with the leaders of Japan and Canada, as well as a working session on supply chain security with representatives from key partner nations.

As the summit progressed, Macron's message of multilateral renewal appeared to resonate with at least some of his counterparts, though the degree to which it will translate into concrete policy changes remains to be seen. In the corridors of the convention center, diplomats and analysts noted that the French president's consistent advocacy for international cooperation, while sometimes met with skepticism, has become an increasingly important counterweight to the rising tide of nationalism and isolationism in global politics.`,
  },
]

// (Custom inline icons have been removed in favor of FontAwesome)

export default function SearchResults() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const { isConnected, status } = useAppKitAccount()
  const router = useRouter()
  const [selectedDocument, setSelectedDocument] = useState<SourceDocument | null>(null)

  useEffect(() => {
    // Only redirect if we are certain they're not connected and not currently connecting
    if (status !== 'reconnecting' && status !== 'connecting' && !isConnected) {
      router.push('/')
    }
  }, [isConnected, status, router])

  if (!isConnected) {
    return null // avoid flash of unauthorized content
  }

  return (
    <div className="min-h-screen bg-[var(--landing-bg)] flex flex-col">
      {/* NavBar */}
      <NavBar showWallet />

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
        {/* Search Input */}
        <div className="relative mb-6">
          <div className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-xl shadow-sm h-14 flex items-center px-4 gap-3">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="w-5 h-5 text-[var(--landing-text-secondary)]" />
            <input
              type="text"
              defaultValue={query}
              placeholder="Search political speeches..."
              className="flex-1 bg-transparent text-[16px] text-[var(--landing-text-primary)] placeholder:text-[var(--landing-text-secondary)] outline-none"
            />
            <Button
              className="h-10 bg-[var(--landing-primary-dark)] text-[var(--landing-bg-white)] font-medium rounded-xl px-6"
            >
              Search
            </Button>
          </div>
        </div>

        {/* AI Summary Card */}
        <div className="relative mb-8 p-6 rounded-2xl border border-[var(--landing-primary-light)] shadow-sm overflow-hidden"
          style={{
            background: 'linear-gradient(167.8deg, var(--landing-primary-subtle) 0%, rgba(3, 105, 209, 0.05) 100%)'
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center shrink-0">
              <FontAwesomeIcon icon={faStar} className="w-4 h-4 text-[var(--landing-bg-white)]" />
            </div>
            <div>
              <h3 className="text-[18px] font-semibold text-[var(--landing-text-primary)]">AI Summary</h3>
              <p className="text-[14px] text-[var(--landing-text-secondary)]">Generated from 4 verified sources</p>
            </div>
          </div>
          <p className="text-[16px] leading-[26px] text-[var(--landing-text-primary)] pl-11">
            Emmanuel Macron has consistently emphasized the importance of multilateral cooperation in addressing global challenges. His speeches highlight climate change as a critical priority, advocating for international collaboration on environmental policies. Macron positions France as a leader in sustainable development and green technology implementation, while stressing that global affairs require collective action rather than unilateral approaches.
          </p>
        </div>

        {/* Source Documents Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[20px] font-semibold text-[var(--landing-text-primary)]">Source Documents</h2>
            <p className="text-[14px] text-[var(--landing-text-secondary)]">Found 4 relevant quotes</p>
          </div>
        </div>

        {/* Quote Cards */}
        <div className="flex flex-col gap-5">
          {quotes.map((quote, index) => (
            <div
              key={index}
              className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-xl shadow-sm p-6"
            >
              {/* Quote */}
              <div className="relative mb-4">
                <span className="absolute -left-1 -top-2 text-[36px] text-[var(--landing-quote-mark)] font-normal">"</span>
                <p className="text-[16px] leading-[26px] text-[var(--landing-text-primary)] pl-5">
                  {quote.text}
                </p>
              </div>

              {/* Author & Source */}
              <div className="flex items-start justify-between pt-4 border-t border-[var(--landing-border)]">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center">
                      <span className="text-[14px] font-semibold text-[var(--landing-bg-white)]">{quote.initials}</span>
                    </div>
                    <span className="text-[14px] font-semibold text-[var(--landing-text-primary)]">{quote.author}</span>
                  </div>
                  <div className="flex items-center gap-4 pl-10">
                    <div className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faFileLines} className="w-3.5 h-3.5 text-[var(--landing-text-secondary)]" />
                      <span className="text-[14px] text-[var(--landing-text-secondary)]">{quote.source}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faCalendarDays} className="w-3.5 h-3.5 text-[var(--landing-text-secondary)]" />
                      <span className="text-[14px] text-[var(--landing-text-secondary)]">{quote.date}</span>
                    </div>
                  </div>
                </div>

                <Button
                  onPress={() => setSelectedDocument(quote)}
                  className="bg-[var(--landing-primary)] text-[var(--landing-bg-white)] font-medium h-11 rounded-xl px-5 flex items-center justify-center gap-2 cursor-pointer"
                >
                  Read Original Document
                  <FontAwesomeIcon icon={faUpRightFromSquare} className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <Footer />

      {/* Document Modal */}
      <SourcesModal
        isOpen={selectedDocument !== null}
        onClose={() => setSelectedDocument(null)}
        document={selectedDocument}
      />
    </div>
  )
}
