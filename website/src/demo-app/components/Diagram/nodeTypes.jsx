import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import {
  Box,
  Layers,
  Server,
  Network,
  Globe,
  Settings as SettingsIcon,
  Lock,
  Database,
  User,
  Users,
  TrendingUp,
  Shield,
  ShieldCheck,
  Key,
  Link as LinkIcon,
  RefreshCw,
  Calendar,
  Briefcase,
  HelpCircle,
  FolderOpen,
} from 'lucide-react';

const KIND_STYLE = {
  Deployment:              { icon: Layers,       accent: 'border-l-blue-500',    badgeLight: 'bg-blue-50 text-blue-600',       badgeDark: 'bg-blue-500/15 text-blue-300' },
  StatefulSet:             { icon: Layers,       accent: 'border-l-indigo-500',  badgeLight: 'bg-indigo-50 text-indigo-600',   badgeDark: 'bg-indigo-500/15 text-indigo-300' },
  DaemonSet:               { icon: Layers,       accent: 'border-l-cyan-500',    badgeLight: 'bg-cyan-50 text-cyan-600',       badgeDark: 'bg-cyan-500/15 text-cyan-300' },
  ReplicaSet:              { icon: RefreshCw,    accent: 'border-l-sky-400',     badgeLight: 'bg-sky-50 text-sky-600',         badgeDark: 'bg-sky-500/15 text-sky-300' },
  Pod:                     { icon: Box,          accent: 'border-l-emerald-500', badgeLight: 'bg-emerald-50 text-emerald-600', badgeDark: 'bg-emerald-500/15 text-emerald-300' },
  Service:                 { icon: Server,       accent: 'border-l-violet-500',  badgeLight: 'bg-violet-50 text-violet-600',   badgeDark: 'bg-violet-500/15 text-violet-300' },
  Endpoints:               { icon: Network,      accent: 'border-l-violet-400',  badgeLight: 'bg-violet-50 text-violet-500',   badgeDark: 'bg-violet-500/15 text-violet-300' },
  EndpointSlice:           { icon: Network,      accent: 'border-l-violet-400',  badgeLight: 'bg-violet-50 text-violet-500',   badgeDark: 'bg-violet-500/15 text-violet-300' },
  Ingress:                 { icon: Globe,        accent: 'border-l-rose-500',    badgeLight: 'bg-rose-50 text-rose-600',       badgeDark: 'bg-rose-500/15 text-rose-300' },
  ConfigMap:               { icon: SettingsIcon, accent: 'border-l-amber-500',   badgeLight: 'bg-amber-50 text-amber-600',     badgeDark: 'bg-amber-500/15 text-amber-300' },
  Secret:                  { icon: Lock,         accent: 'border-l-orange-500',  badgeLight: 'bg-orange-50 text-orange-600',   badgeDark: 'bg-orange-500/15 text-orange-300' },
  PersistentVolumeClaim:   { icon: Database,     accent: 'border-l-teal-500',    badgeLight: 'bg-teal-50 text-teal-600',       badgeDark: 'bg-teal-500/15 text-teal-300' },
  ServiceAccount:          { icon: User,         accent: 'border-l-slate-500',   badgeLight: 'bg-slate-100 text-slate-600',    badgeDark: 'bg-slate-500/20 text-slate-300' },
  HorizontalPodAutoscaler: { icon: TrendingUp,   accent: 'border-l-green-500',   badgeLight: 'bg-green-50 text-green-600',     badgeDark: 'bg-green-500/15 text-green-300' },
  NetworkPolicy:           { icon: Shield,       accent: 'border-l-red-500',     badgeLight: 'bg-red-50 text-red-600',         badgeDark: 'bg-red-500/15 text-red-300' },
  Job:                     { icon: Briefcase,    accent: 'border-l-slate-500',   badgeLight: 'bg-slate-100 text-slate-600',    badgeDark: 'bg-slate-500/20 text-slate-300' },
  CronJob:                 { icon: Calendar,     accent: 'border-l-stone-500',   badgeLight: 'bg-stone-100 text-stone-600',    badgeDark: 'bg-stone-500/20 text-stone-300' },
  // RBAC kinds
  Role:                    { icon: ShieldCheck,  accent: 'border-l-amber-500',   badgeLight: 'bg-amber-50 text-amber-600',     badgeDark: 'bg-amber-500/15 text-amber-300' },
  ClusterRole:             { icon: ShieldCheck,  accent: 'border-l-orange-500',  badgeLight: 'bg-orange-50 text-orange-600',   badgeDark: 'bg-orange-500/15 text-orange-300' },
  RoleBinding:             { icon: LinkIcon,     accent: 'border-l-blue-500',    badgeLight: 'bg-blue-50 text-blue-600',       badgeDark: 'bg-blue-500/15 text-blue-300' },
  ClusterRoleBinding:      { icon: LinkIcon,     accent: 'border-l-indigo-500',  badgeLight: 'bg-indigo-50 text-indigo-600',   badgeDark: 'bg-indigo-500/15 text-indigo-300' },
  'Subject:User':          { icon: User,         accent: 'border-l-slate-500',   badgeLight: 'bg-slate-100 text-slate-600',    badgeDark: 'bg-slate-500/20 text-slate-300' },
  'Subject:Group':         { icon: Users,        accent: 'border-l-slate-600',   badgeLight: 'bg-slate-100 text-slate-700',    badgeDark: 'bg-slate-500/20 text-slate-200' },
  Permission:              { icon: Key,          accent: 'border-l-emerald-500', badgeLight: 'bg-emerald-50 text-emerald-600', badgeDark: 'bg-emerald-500/15 text-emerald-300' },
};

const DEFAULT_STYLE = {
  icon: HelpCircle,
  accent: 'border-l-gray-400',
  badgeLight: 'bg-gray-100 text-gray-600',
  badgeDark: 'bg-gray-700 text-gray-300',
};

const getStatusDotColor = (status) => {
  if (!status) return null;
  const s = String(status).toLowerCase();
  if (s.includes('fail') || s.includes('crash') || s.includes('error') || s.includes('oom') || s.includes('backoff')) {
    return 'bg-red-500';
  }
  if (s.includes('pending') || s.includes('terminat') || s.includes('waiting') || s.includes('0/')) {
    return 'bg-amber-400';
  }
  if (s.includes('running') || s.includes('ready') || s.includes('active') || s.includes('bound') || s.includes('succeeded')) {
    return 'bg-emerald-500';
  }
  return 'bg-slate-400';
};

const buildTooltip = (data) => {
  const lines = [`${data.kind}: ${data.namespace ? `${data.namespace}/` : ''}${data.name}`];
  if (data.status) lines.push(`Status: ${data.status}`);
  const md = data.metadata || {};
  if (md.image) lines.push(`Image: ${md.image}`);
  if (md.replicas) lines.push(`Replicas: ${md.replicas}`);
  if (md.derived) lines.push('Derived (no read access)');
  if (typeof md.nps_count === 'number' && md.nps_count > 0) {
    lines.push(`NetworkPolicies selecting this: ${md.nps_count}`);
  }
  return lines.join('\n');
};

const ResourceNode = memo(({ data }) => {
  const style = KIND_STYLE[data.kind] || DEFAULT_STYLE;
  const Icon = style.icon;
  const npsCount = data.metadata?.nps_count || 0;
  const derived = data.metadata?.derived === true;
  const isLR = data.direction === 'LR';
  const statusDot = getStatusDotColor(data.status);

  const cardSurface = data.isDark
    ? 'bg-slate-900/95 border-slate-700/80 text-slate-100 hover:border-slate-500'
    : 'bg-white border-slate-200/90 text-slate-900 hover:border-slate-300';

  return (
    <div
      title={buildTooltip(data)}
      className={`relative rounded-xl border border-l-4 shadow-sm hover:shadow-md transition-all px-3 py-2.5 w-[220px] ${cardSurface} ${style.accent} ${
        derived ? 'border-dashed opacity-85' : ''
      }`}
    >
      <Handle
        type="target"
        position={isLR ? Position.Left : Position.Top}
        style={{ background: '#94a3b8', width: 7, height: 7, border: '2px solid transparent' }}
      />
      <div className="flex items-center gap-2.5">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            data.isDark ? style.badgeDark : style.badgeLight
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className={`text-[10px] font-medium uppercase tracking-wider truncate ${data.isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {data.kind}
            </span>
            {npsCount > 0 && (
              <span
                className={`flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  data.isDark
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-red-50 text-red-700'
                }`}
                title={`${npsCount} NetworkPolic${npsCount === 1 ? 'y' : 'ies'} select this resource`}
              >
                <Shield className="w-2.5 h-2.5" />
                <span>{npsCount}</span>
              </span>
            )}
          </div>
          <div className="text-xs font-semibold truncate mt-0.5" title={data.name}>
            {data.name}
          </div>
          {data.status && (
            <div className={`flex items-center gap-1.5 mt-1 text-[10px] truncate ${data.isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {statusDot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot}`} />}
              <span className="truncate">{data.status}</span>
            </div>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={isLR ? Position.Right : Position.Bottom}
        style={{ background: '#94a3b8', width: 7, height: 7, border: '2px solid transparent' }}
      />
    </div>
  );
});

const CollapsedGroupNode = memo(({ data }) => {
  const isLR = data.direction === 'LR';
  return (
    <div
      onClick={data.onExpand}
      className={`cursor-pointer rounded-xl border-2 border-dashed shadow-sm hover:shadow-md transition-all px-4 py-3 w-[220px] ${
        data.isDark
          ? 'bg-slate-800/90 border-slate-600 text-slate-100 hover:border-blue-400 hover:bg-slate-800'
          : 'bg-slate-50 border-slate-300 text-slate-900 hover:border-blue-500 hover:bg-white'
      }`}
      title="Click to expand group"
    >
      <Handle
        type="target"
        position={isLR ? Position.Left : Position.Top}
        style={{ background: '#94a3b8', width: 7, height: 7 }}
      />
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${data.isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
          <FolderOpen className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-xs font-semibold truncate">{data.label}</div>
          <div className={`text-[10px] mt-0.5 ${data.isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {data.count} resource{data.count === 1 ? '' : 's'} · click to expand
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={isLR ? Position.Right : Position.Bottom}
        style={{ background: '#94a3b8', width: 7, height: 7 }}
      />
    </div>
  );
});

ResourceNode.displayName = 'ResourceNode';
CollapsedGroupNode.displayName = 'CollapsedGroupNode';

export const nodeTypes = {
  resource: ResourceNode,
  collapsedGroup: CollapsedGroupNode,
};

export default nodeTypes;
