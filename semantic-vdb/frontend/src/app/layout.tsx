
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'Arial, sans-serif',
          margin: 0,
          padding: 0,
          display: 'flex',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#181818',
          color: '#ffffff',
        }}
      >
        {children}
      </body>
    </html>
  )
}