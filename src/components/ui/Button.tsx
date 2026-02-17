import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

// 使用简化的类型定义以避免冲突
interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    children?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {

        const variants = {
            primary: 'bg-primary text-white hover:bg-primary-hover shadow-lg shadow-blue-500/20 border border-blue-400/20',
            secondary: 'bg-surface2 text-text hover:bg-zinc-700 border border-white/10',
            ghost: 'bg-transparent hover:bg-white/5 text-text-muted hover:text-text',
            danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20',
        };

        const sizes = {
            sm: 'px-3 py-1.5 text-xs',
            md: 'px-4 py-2 text-sm',
            lg: 'px-6 py-3 text-base',
        };

        return (
            <motion.button
                ref={ref}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    'relative inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:pointer-events-none overflow-hidden',
                    variants[variant],
                    sizes[size],
                    className
                )}
                {...props}
            >
                {/* Glow effect on hover */}
                {variant === 'primary' && (
                    <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12"
                        initial={{ x: '-150%' }}
                        whileHover={{ x: '150%' }}
                        transition={{ duration: 0.8, ease: "easeInOut" }}
                    />
                )}

                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <span className="relative z-10 flex items-center gap-2">{children}</span>
            </motion.button>
        );
    }
);

Button.displayName = "Button";

export { Button };
