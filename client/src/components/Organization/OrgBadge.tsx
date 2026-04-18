import { Users } from 'lucide-react';

interface OrgBadgeProps {
  organizationId?: string;
}

export default function OrgBadge({ organizationId }: OrgBadgeProps) {
  if (!organizationId) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      <Users className="h-3 w-3" />
      Org
    </span>
  );
}
