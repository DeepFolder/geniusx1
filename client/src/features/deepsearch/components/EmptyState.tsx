import DeepFolderLogo from "@assets/logo_DeepFolder_1760649570860.png";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="-mb-4 flex justify-center">
        <img src={DeepFolderLogo} alt="DeepFolder" className="h-24 sm:h-28 md:h-32 w-auto object-contain scale-110" style={{ objectPosition: 'center' }} />
      </div>
      <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 md:mb-4 tracking-tight leading-tight text-center">
        Discover. Connect.{" "}
        <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">Innovate.</span>
      </h1>
      <p className="text-sm sm:text-base md:text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed px-4 text-center">
        Explore the Future of Product Discovery
      </p>
    </div>
  );
}
