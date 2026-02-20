import React from 'react';
import {cn} from '../../lib/utils';
import {motion} from 'framer-motion';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onAnimationStart' | 'onDrag' | 'onDragEnd' | 'onDragEnter' | 'onDragLeave' | 'onDragOver' | 'onDragStart' | 'onDrop'> {
    icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({className, type, icon, ...props}, ref) => {
        const MotionInput = motion.input as any;

        return (
            <div className="relative">
                {icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                        {icon}
                    </div>
                )}
                <MotionInput
                    type={type}
                    whileFocus={{scale: 1.01}}
                    className={cn(
                        "flex h-10 w-full rounded-md border border-white/10 bg-surface2/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all",
                        icon ? "pl-10" : "",
                        className
                    )}
                    ref={ref}
                    {...props}
                />
            </div>
        );
    }
);
Input.displayName = "Input";

export {Input};
