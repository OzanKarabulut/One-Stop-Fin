import {
  BarChart3,
  TrendingUp,
  Newspaper,
  GraduationCap,
  FileText,
  Podcast,
  type LucideIcon,
} from "lucide-react";

export interface ModuleItem {
  href: string;
  labelKey: string;
}

export interface ModuleDefinition {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  implemented: boolean;
  items: ModuleItem[];
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    id: "signallab",
    labelKey: "modules.signallab",
    icon: TrendingUp,
    implemented: true,
    items: [
      { href: "/dashboard/signallab/csp-screener", labelKey: "modules.signallab.csp" },
      { href: "/dashboard/signallab/ai-strategy", labelKey: "modules.signallab.aiStrategy" },
      { href: "/dashboard/signallab/manual", labelKey: "modules.signallab.manual" },
      { href: "/dashboard/signallab/market-overview", labelKey: "modules.signallab.market" },
      { href: "/dashboard/signallab/watchlist", labelKey: "modules.signallab.watchlist" },
    ],
  },
  {
    id: "finsumy",
    labelKey: "modules.finsumy",
    icon: BarChart3,
    implemented: true,
    items: [
      { href: "/dashboard/overview", labelKey: "modules.finsumy.overview" },
      { href: "/dashboard/summaries/youtube", labelKey: "modules.finsumy.youtube" },
      { href: "/dashboard/channels", labelKey: "modules.finsumy.channels" },
      { href: "/dashboard/signal-leaders", labelKey: "modules.finsumy.signalLeaders" },
    ],
  },
  {
    id: "newssumy",
    labelKey: "modules.newssumy",
    icon: Newspaper,
    implemented: false,
    items: [],
  },
  {
    id: "edusumy",
    labelKey: "modules.edusumy",
    icon: GraduationCap,
    implemented: false,
    items: [],
  },
  {
    id: "docsumy",
    labelKey: "modules.docsumy",
    icon: FileText,
    implemented: false,
    items: [],
  },
  {
    id: "podsumy",
    labelKey: "modules.podsumy",
    icon: Podcast,
    implemented: false,
    items: [],
  },
];
