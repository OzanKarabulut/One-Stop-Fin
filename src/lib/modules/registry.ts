import {
  BarChart3,
  TrendingUp,
  Newspaper,
  GraduationCap,
  FileText,
  Podcast,
  Shield,
  Brain,
  Activity,
  Target,
  PenTool,
  Globe,
  Eye,
  type LucideIcon,
} from "lucide-react";

export interface ModuleItem {
  href: string;
  labelKey: string;
  icon?: LucideIcon;
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
      { href: "/dashboard/signallab/csp-screener", labelKey: "modules.signallab.csp", icon: Shield },
      { href: "/dashboard/signallab/ai-strategy", labelKey: "modules.signallab.aiStrategy", icon: Brain },
      { href: "/dashboard/signallab/vol-console", labelKey: "modules.signallab.volConsole", icon: Activity },
      { href: "/dashboard/signallab/command-center", labelKey: "modules.signallab.commandCenter", icon: Target },
      { href: "/dashboard/signallab/manual", labelKey: "modules.signallab.manual", icon: PenTool },
      { href: "/dashboard/signallab/market-overview", labelKey: "modules.signallab.market", icon: Globe },
      { href: "/dashboard/signallab/watchlist", labelKey: "modules.signallab.watchlist", icon: Eye },
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
