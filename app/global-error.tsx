"use client"

export default function GlobalError({error}: {error: Error & {digest?: string}}) {
return (
    <html>
        <body className="">
            <h2 className="">
                {error.message}
            </h2>
        </body>
    </html>
)
}