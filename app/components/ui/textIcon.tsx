import { cn } from '@/lib/utils'
import Link from 'next/link'
import React, { ReactNode } from 'react'

const TextIcon = ({icon, text, extraClass, onClick, href = '#home'}: {icon: ReactNode, text: string, extraClass?: string, onClick?: () => void, href?: string}) => {
  return (
    <Link href={href} className={cn('flex justify-start items-end gap-1', extraClass)} onClick={onClick}>
        <div className="relative w-[30px] h-auto min-h-[35px]">{icon}</div>
        <span className="text-3xl font-bold text-primary translate-y-1">{text}</span>
    </Link>
  )
}

export default TextIcon