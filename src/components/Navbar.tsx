'use client';

export default function Navbar() {
  return (
    <nav className="w-full bg-white shadow-sm px-4 py-3 flex items-center">
      <div className="flex items-center space-x-2">
        {/* Logo */}
        <img
          src="/logo.jpeg"
          alt="Logo"
          className="h-18 w-auto object-contain"
        />

        {/* Si quieres también texto o marca */}
        {/* <span className="font-semibold text-lg">Mi Empresa</span> */}
      </div>
    </nav>
  );
}
