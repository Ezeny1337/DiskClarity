import React from 'react';
import {cn} from '../../lib/utils';

interface MainLayoutProps {
    children: React.ReactNode;
    sidebar?: React.ReactNode;
    header?: React.ReactNode;
    className?: string;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
                                                          children,
                                                          header,
                                                          className
                                                      }) => {
    return (
        <div className="flex h-screen flex-col bg-background text-text overflow-hidden">
            {/* 标题栏区域 */}
            {header}

            {/* 主要内容 */}
            <main className={cn("flex-1 overflow-hidden relative", className)}>
                {children}
            </main>
        </div>
    );
};
