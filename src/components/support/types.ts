export interface BugReport {
    id?: string;
    title: string;
    description: string;
    type: 'bug' | 'feature' | 'improvement' | 'question';  
    priority: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    steps: string[];
    expected?: string;
    actual?: string;
    screenshots?: File[];
    user_agent: string;
    url: string;
    userId?: string;
    tenantId?: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    created_at: Date | string;
    updated_at: Date | string;
}

export interface SupportConfig {
    enabled: boolean;
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    autoOpen?: boolean;
    collectSystemInfo?: boolean;
    allowScreenshots?: boolean; 
}
